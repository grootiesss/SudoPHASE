# Multithreaded ACO-SA Sudoku Solver

A C++ Sudoku solver based on **Ant Colony Optimization (ACS)** with **Simulated Annealing (SA)** and optional **parallel multi-colony** search. The parallel variant uses a ring topology and random matching for pheromone exchange between sub-colonies (RMACO-style).

## Description

This project implements three solving methods:

| Algorithm | Description |
|-----------|-------------|
| **0** | Single-colony Ant Colony System (ACS) with optional SA (modified). Lloyd & Amos, IEEE Trans. on Games (2021). |
| **1** | Exact backtracking search (reference / validation). |
| **2** | **Parallel ACS**: multiple sub-colonies in separate threads; ring + random topology; three-source pheromone update; adaptive exchange interval. Yang et al., "RMACO: a randomly matched parallel ant colony optimization," World Wide Web (2016). |

### Key Features
- **Scalability**: Solves 9×9, 16×16, and 25×25 Sudoku puzzles (order 3, 4, 5).
- **Simulated Annealing (SA)**: Optional application every `safreq` iterations; can be customized using specific initial, minimum temperatures, and cooling rates. Acceptance criteria is adjustable via `--saAccept` (conservative/hybrid or CP-like).
- **Multithreading**: Algorithm 2 implements multiple threaded colonies (`--threads`) with adaptive communication between them (`--commEarly`, `--commLate`, `--commThreshold`).
- **Interfaces**: Provides a command-line interface, a python script for batch runs, and web/desktop apps for graphical interaction.

## Dataset

Puzzle instances are located under the `instances/` directory:

| Folder | Description |
|--------|-------------|
| `instances/general` | General logic-solvable instances (`.txt`). |
| `instances/logic-solvable` | Logic-solvable puzzles. |
| `instances/9x9-database` | 9×9 instance set (e.g. `9x9_00001.txt`, ranges). |
| `instances/16x16-database` | 16×16 instance set (e.g. `16x16_02203.txt`). |
| `instances/25x25-database` | 25×25 instance set. |
| `instances/curated-dataset` | Optional curated dataset (used on conference paper proposal / may be provided as a zip). |

**Puzzle file format (for `--file`):**
- **Line 1:** Order of the puzzle (e.g., `3` for 9×9, `4` for 16×16, `5` for 25×25).
- **Line 2:** Unused integer (e.g., `0`), originally used for fixed-cell percentage value.
- **Remaining Lines:** Space-separated cell values in row-major order:
  - `-1` = empty cell
  - `1`–`9` for 9×9 → digits `1`–`9`
  - For 16×16: `1`–`10` → `0`–`9`, `11`–`16` → `a`–`f`
  - For 25×25: `1`–`25` → `a`–`y`

*Example (9×9, first line “3”, second “0”, then 81 values with `-1` for blanks):*
```
3
0
-1 -1 3 -1 2 -1 -1 -1 -1
...
```

## Building

**Requirements:** C++11 compiler (e.g., `g++`) with `pthread` support.

1. From the **repository root**:
   ```bash
   mkdir -p obj
   make -f markdowns/Makefile
   ```
   *Note: The makefile uses `g++`. Any compiler supporting C++11 will work. For Windows users, a Visual Studio 2017 project file is included in the `vs2017` folder.*

2. The executable is produced as **`sudokusolver`** in the project root.

**Windows (PowerShell):**
```powershell
New-Item -ItemType Directory -Force -Path obj
make -f markdowns/Makefile
```
*Note: If you use a Visual Studio build that produces `sudoku_ants.exe`, place it in the repo root or under `vs2017/x64/Release/`.*

## Command-line Arguments

All configuration options use a double-dash prefix.

### Core Configuration
| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--file` | string | — | Path to puzzle file (order + idum + cell values). |
| `--puzzle` | string | — | One-line puzzle string (e.g. digits and `.` for empty). Alternative to `--file`. |
| `--order` | int | — | Order of the grid (e.g. 3 = 9×9). Used with `--blank` for an empty grid. |
| `--blank` | flag | 0 | If set with `--order`, use a blank puzzle. |
| `--alg` | int | 0 | Solver: **0** = ACS, **1** = backtracking, **2** = parallel ACS. |
| `--timeout` | int | 120 | Time limit in seconds. |

### Ant Colony System (ACS)
| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--ants` | int | 10 | Number of ants per colony (alg 0 and 2). |
| `--q0` | float | 0.9 | ACS exploitation probability. |
| `--rho` | float | 0.9 | ACS pheromone decay (global update). |
| `--evap` | float | 0.005 | Best-so-far evaporation rate. |

### Simulated Annealing (SA)
| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--safreq` | int | 0 | Apply SA every N iterations (0 = disabled). |
| `--saAccept` | int | 0 | **0** = conservative/hybrid, **1** = always accept SA result (CP-like). |
| `--saTinit` | float | 1.5 | Initial temperature for SA. |
| `--saTmin` | float | 0.01 | Minimum temperature for SA. |
| `--saCooling` | float | 0.995 | Cooling rate multiplier for SA. |

### Parallel ACS Options (Algorithm 2)
| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--threads` | int | 4 | Number of threads (sub-colonies). |
| `--commEarly` | int | 100 | Early communication interval between colonies. |
| `--commLate` | int | 10 | Late communication interval between colonies. |
| `--commThreshold`| int | 200 | Iteration threshold to switch from early to late communication. |

### Outputs and Display
| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--verbose` | flag | 0 | Print full solution grid, time, iterations. |
| `--showinitial`| flag | 0 | Print initial constrained grid before solving. |
| `--stream` | flag | 0 | Stream progress text to stdout continuously. |

## Running the solver on a single puzzle

Use either a **puzzle file** or a **puzzle string**.

**Using a file (recommended):**
```bash
./sudokusolver --file instances/general/example.txt --alg 2 --timeout 60 --verbose
```

**Using a puzzle string (9×9: 81 chars, `.` = empty):**
```bash
./sudokusolver --puzzle "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79" --alg 0 --verbose
```

**Minimal output (success + time only):**
```bash
./sudokusolver --file instances/general/example.txt --alg 2 --timeout 120
# Prints: 0 or 1 (success/fail), then solution time in seconds
```

**Parallel ACS with custom SA and Communication params:**
```bash
./sudokusolver --file instances/9x9-database/9x9_00001.txt --alg 2 --threads 8 --ants 10 --safreq 100 --saTinit 2.0 --saTmin 0.05 --saCooling 0.95 --commEarly 150 --commLate 20 --commThreshold 300 --timeout 120 --verbose
```

**Backtracking (exact) for validation:**
```bash
./sudokusolver --file instances/general/example.txt --alg 1 --verbose
```

## Built-in script: `run_general.py`

The Python script `scripts/run_general.py` runs the solver on multiple instances sequentially and writes CSV metrics tracking execution times, iteration counts, parameters, and successes.

**Solver binary:** The script looks for `sudoku_ants` (or `sudoku_ants.exe` on Windows) in the repo root or under `vs2017/`. If you built with the Makefile you get `sudokusolver`; either copy/symlink it to `sudoku_ants` or pass the path explicitly:

```bash
python scripts/run_general.py --solver ./sudokusolver --alg 2 --verbose
```

**Examples:**
```bash
# Parallel ACS (alg 2), custom timeout, and output CSV
python scripts/run_general.py --solver ./sudokusolver --alg 2 --timeout 60 --output results/alg2_60s.csv --verbose

# Run a subset of instances from 16x16 database
python scripts/run_general.py --instances-root instances/16x16-database --range-start 16x16_02203 --range-end 16x16_02436 --output results/16x16.csv --solver ./sudokusolver

# Filter by puzzle size and fixed-cell percentage
python scripts/run_general.py --puzzle-size 9x9 --fixed-percentage 40 45 --solver ./sudokusolver --output results/9x9_40_45.csv

# Limit number of instances and configure threads + SA parameters
python scripts/run_general.py --solver ./sudokusolver --alg 2 --threads 8 --safreq 100 --saAccept 0 --limit 50 --output results/limited.csv
```

## Deploying as web or desktop application

- **Web app:** From the repo root, run `pip install -r webapp/requirements.txt` and `python webapp/app.py`, then open http://127.0.0.1:5000. The solver runs on the server with `--alg 2` and uses the background threads setting to exploit multiple processors.
- **Desktop app:** From the repo root, run `python desktop/sudoku_desktop.py`. A Tkinter window opens with a 9×9 grid; set the thread count and click **Solve**. The solver runs locally without any required browser setup. See `desktop/README.md`.
- **Other stacks:** See `markdowns/DEPLOYMENT_APP.md` for production deployment, Electron, Qt, mobile, etc.

## References

- Lloyd & Amos, IEEE Trans. on Games (2021) — ACS core for Sudoku.
- Yang et al., "RMACO: a randomly matched parallel ant colony optimization," World Wide Web (2016) — ring + random topology, three-source update, adaptive interval.
- See `ACO_PAPER_VERIFICATION.md` and `RMACO_PARALLEL_ADAPTATION.md` in the repo for additional verification details.