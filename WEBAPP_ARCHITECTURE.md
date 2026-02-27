## SudoPHASE Web Application – Architecture Overview

This document explains how the SudoPHASE web app works: the backend solver, multithreading model, APIs, and front‑end flow.

---

### 1. High‑level architecture

- **Frontend**: single‑page UI (`webapp/templates/index.html`)
  - Sudoku grid (9×9, 16×16, 25×25)
  - Puzzle library browser
  - Parameters panel (timeout, number of “threads/colonies”)
  - Talks to the backend via JSON APIs (`/api/library`, `/api/instance/...`, `/api/solve`, `/api/status/...`)

- **Backend (Python / Flask)**: `webapp/app.py`
  - Serves HTML templates and static assets
  - Thin orchestration layer between browser and C++ solver
  - Manages a small in‑memory job store and background threads

- **Solver (C++)**: native binary (`sudokusolver` or `sudoku_ants.exe`)
  - Implements Ant Colony System (ACS) + Simulated Annealing (SA)
  - Uses multiple threads to run several “sub‑colonies” in parallel
  - Communicates with Python via command‑line arguments and stdout

---

### 2. Flask app structure (`webapp/app.py`)

- **App setup**

  - `app = Flask(__name__)`
  - `REPO_ROOT` = repository root (two levels above `app.py`)
  - `INSTANCES_ROOT` = `REPO_ROOT / "instances"`

- **Problem sizes**

  ```python
  SIZES = [("9×9", 3, 81), ("16×16", 4, 256), ("25×25", 5, 625)]
  ```

  Each tuple is `(label, order, num_cells)` where `order**4` is the number of cells.

- **Job store**

  ```python
  _job_store: dict[str, dict] = {}
  _job_store_lock = threading.Lock()
  ```

  - Maps `job_id` → `{"status": "pending"|"done"|"error", "result": {...}}`
  - Guarded by `_job_store_lock` for thread‑safety

---

### 3. Finding and running the solver

#### 3.1 `find_solver()`

- On Windows, looks for `sudoku_ants.exe` in:
  - repo root
  - `vs2017/x64/Release/`
  - `vs2017/Release/`
- On Linux/Unix, looks for `sudokusolver` or `sudoku_ants` in the repo root.
- Returns the first existing path or raises `FileNotFoundError` (surfaced as a 500 error from `/api/solve`).

#### 3.2 `parse_verbose_stdout(stdout, order)`

Parses the solver’s verbose text output to extract:

- `success`: `True` if solved, `False` if failed within the time limit, `None` if unknown
- `time`: wall‑clock solve time in seconds
- `iterations`: iteration count (if printed)
- `communication`: `True`/`False` depending on whether inter‑colony communication was used
- `solution`: a flat string encoding the final grid, using:
  - 9×9: `1..9`
  - 16×16: `0..9` + `a..f`
  - 25×25: `a..y`

The function scans lines for patterns like:

- `"solved in X.Y"` / `"failed in time X.Y"`
- `"iterations: N"`, `"communication: yes|no"`
- a `Solution:` block followed by cell values

For 16×16 and 25×25, the C++ solver prints **numbers**; these are remapped back into the character alphabet expected by the web UI.

#### 3.3 `_run_solver_sync(puzzle, timeout, subcolonies, alg, order)`

Responsible for one **synchronous** call to the C++ solver:

1. Resolve the binary path with `find_solver()`.
2. Build the command line:

   ```python
   cmd = [
       str(solver_path),
       "--puzzle", puzzle,
       "--alg", str(alg),
       "--timeout", str(timeout),
       "--verbose",
   ]
   if alg == 2:
       cmd.extend(["--subcolonies", str(subcolonies)])
   ```

3. Invoke `subprocess.run` with `cwd=REPO_ROOT`, `capture_output=True`, and a small extra timeout margin.
4. Parse stdout with `parse_verbose_stdout`.
5. Return a normalized dict:

   ```json
   {
     "status": "done",
     "result": {
       "success": true/false/null,
       "solution": "...",
       "time": 12.34,
       "iterations": 1234,
       "communication": true/false,
       "error": null or "raw error text"
     }
   }
   ```

On timeout or unexpected exceptions, it returns `{"status": "error", "result": {"error": "..."}}`.

---

### 4. Multithreading model

There are **two separate layers of concurrency**: Python threads and C++ threads.

#### 4.1 Python level: background job threads

Endpoint `/api/solve` does not block on the C++ solver. Instead it:

1. Validates input JSON (`puzzle`, `timeout`, `subcolonies`, `alg`, `order`).
2. Checks that `len(puzzle) == order**4`.
3. Creates a new `job_id` (UUID).
4. Adds an entry in `_job_store`:

   ```python
   _job_store[job_id] = {"status": "pending", "result": None}
   ```

5. Starts a **background thread**:

   ```python
   t = threading.Thread(
       target=_worker,
       args=(job_id, puzzle, timeout, subcolonies, alg, order),
       daemon=True,
   )
   t.start()
   ```

6. Returns `{ "job_id": "..." }` with HTTP status `202 Accepted`.

The `_worker` function calls `_run_solver_sync(...)` and then, under `_job_store_lock`, writes the final outcome back into `_job_store[job_id]`.

Endpoint `/api/status/<job_id>` reads this entry and returns the current status. The frontend polls this endpoint until the job is `done` or `error`.

**Result:** long‑running solves do not block Flask’s request thread; the UI stays responsive while the C++ solver runs in the background.

#### 4.2 C++ level: parallel ACS sub‑colonies

Inside the solver (C++ code in `src/parallelsudokuantsystem.cpp` and related files):

- `ParallelSudokuAntSystem::Solve` constructs `numSubColonies` `SubColony` objects.
- It then launches one **std::thread** per sub‑colony:

  ```cpp
  std::vector<std::thread> threads;
  for (int i = 0; i < numSubColonies; i++) {
      threads.emplace_back(&ParallelSudokuAntSystem::SubColonyWorker,
                           this, i, std::ref(puzzle));
  }
  ```

- Each `SubColonyWorker`:
  - Initializes its colony state for the puzzle.
  - Runs an ACS loop: construct solutions, evaluate, update pheromone.
  - Periodically:
    - Enters a barrier to synchronize with other sub‑colonies.
    - Exchanges best solutions using:
      - **Ring topology**: iteration‑best is sent to the next colony in a ring.
      - **Random topology**: best‑so‑far is sent according to a random permutation.
    - Performs a **three‑source pheromone update** based on these solutions.
  - Optionally invokes Simulated Annealing on its best solution, depending on `--safreq` and `--saAccept`.

The `--subcolonies` parameter passed from the web UI controls `numSubColonies` and therefore the number of C++ worker threads.

**Note on Render logs:** the line `WEB_CONCURRENCY=1` refers only to the number of Gunicorn worker **processes** serving HTTP, not the number of threads inside the solver. The C++ binary still starts as many OS threads as requested.

---

### 5. Web API endpoints

#### 5.1 UI pages

- `GET /`  
  Renders `templates/menu.html` (main menu).

- `GET /play`  
  Renders `templates/index.html` (interactive Sudoku UI).

- `GET /create`, `GET /about`  
  Render additional pages for puzzle creation and project information.

- `GET /logo`  
  Serves `SudoPhase_Logo.png` from the webapp directory or falls back to `static/logo.png`.

#### 5.2 Puzzle library APIs

- `GET /api/library`

  - Scans `instances/curated-dataset` for `.txt` instance files.
  - Uses `_read_instance_file` to determine the order (3/4/5) and converts each file into an entry in a size‑indexed dictionary.
  - Response:

    ```json
    {
      "9×9":  [ { "name": "9x9_01.txt",  "path": "curated-dataset/9x9_01.txt" }, ... ],
      "16×16": [ ... ],
      "25×25": [ ... ]
    }
    ```

- `GET /api/instance/<path>`

  - Returns `{ "order": 3|4|5, "puzzle": "<flat string>" }` for one instance.
  - Enforces safety:
    - Rejects paths containing `""`, `"."`, `".."`.
    - Requires that files live under `instances/curated-dataset`.

  - `_read_instance_file` parses the text format used by the C++ solver:
    - Line 1: `order` (3, 4, or 5)
    - Line 2: unused integer (historically fixed‑cell percentage)
    - Remaining lines: space‑separated integers (`-1` = empty, positive numbers = values)
    - Converts numeric values into characters (`1..9`, `0..9`/`a..f`, or `a..y`) for the web frontend.

#### 5.3 Solving APIs

- `POST /api/solve`

  Request body:

  ```json
  {
    "puzzle": "<flat puzzle string>",
    "timeout": 120,
    "subcolonies": 4,
    "alg": 2,
    "order": 3
  }
  ```

  - Validates puzzle length (`len(puzzle) == order**4`).
  - Normalizes numeric parameters (`timeout`, `subcolonies`, `alg`, `order`).
  - Starts a background job thread as described in §4.1.
  - Returns:

  ```json
  { "job_id": "uuid-..." }
  ```

  with HTTP status `202 Accepted`.

- `GET /api/status/<job_id>`

  - Looks up the job in `_job_store`.
  - If not found, returns 404.
  - Otherwise returns the stored status, for example:

  ```json
  {
    "status": "done",
    "result": {
      "success": true,
      "solution": "...",
      "time": 10.23,
      "iterations": 1234,
      "communication": true,
      "error": null
    }
  }
  ```

---

### 6. Frontend flow (`webapp/templates/index.html`)

- **Grid rendering**
  - Uses CSS Grid (`.sudoku-grid`) to render an `n × n` grid where `n = order**2`.
  - Thicker borders (`.block-right`, `.block-bottom`) mark sub‑grid boundaries:
    - 3×3 blocks for 9×9
    - 4×4 blocks for 16×16
    - 5×5 blocks for 25×25

- **Number pad and controls**
  - Undo stack and Erase button implemented in JavaScript.
  - Digit buttons are generated dynamically based on the current order (1–9, 1–16, or 1–25).

- **Puzzle encoding**
  - UI uses digits `1..9` or numbers `1..25`.
  - Helper functions (`gridToPuzzle`, `puzzleToGrid`, `order4DisplayToChar`, `order5DisplayToChar`, etc.) convert between:
    - UI representation (numbers the user sees)
    - Backend representation (`.`, digits, and letters) used by the solver.

- **Calling the solver**
  - When the user clicks **Solve**:
    1. The current grid is flattened into a puzzle string.
    2. The app sends `POST /api/solve`.
    3. If a `job_id` is returned, it polls `GET /api/status/<job_id>` until the job finishes.
    4. The result panel shows:
       - Solve time
       - Iterations
       - Whether communication was enabled
       - Any error message
    5. If a solution string is present, `setSolution(...)` animates the solver’s answer into the grid.

---

### 7. LAN deployment (share on local network)

On a Windows host where the solver is built:

```powershell
cd "d:\Thesis\Progress\Original Repo\Multi swarm\ACS-SA-RING\MT-ACS-RING"

python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r webapp\requirements.txt

python webapp\app.py --public
```

- The app listens on `0.0.0.0:5000`.
- Use `ipconfig` to find your **IPv4 address** (for example `192.168.1.23`).
- Friends on the same Wi‑Fi can open:

```text
http://192.168.1.23:5000/
```

to access the SudoPHASE web UI running on your machine.

