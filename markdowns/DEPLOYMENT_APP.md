# Deploying as a Web Application or Desktop Application

The solver is a **command-line C++ program**. To deploy it as a **web app** or **desktop app**, you add a UI layer that calls the solver and shows results. Your multi-threaded algorithm (alg 2) still runs on the server’s or the machine’s processors.

---

## Option 1: Web application

**Idea:** A web server runs the solver (as a subprocess or via a library). The browser sends the puzzle and gets back the solution (and stats). The solver uses multiple cores on the **server** via `--alg 2 --subcolonies N`.

### 1a. Provided minimal web app (Python + HTML/JS)

This repo includes a minimal **Flask** web app that:

- Serves a 9×9 Sudoku grid in the browser.
- Accepts a puzzle, runs the C++ solver with `--alg 2` and configurable `--subcolonies`, and returns JSON (success, solution, time, iterations).

**Location:** `webapp/`. To run:

1. Build the solver (e.g. `make -f markdowns/Makefile` or VS Release → `sudoku_ants.exe`).
2. From repo root:
   ```bash
   pip install -r webapp/requirements.txt
   python webapp/app.py
   ```
3. Open http://127.0.0.1:5000 and use the grid to enter a puzzle and click Solve.
   To listen on all interfaces (e.g. for LAN access): `python webapp/app.py --public`

**Deploying the web app:**

- **Same machine:** Run `python webapp/app.py` and use it locally (or bind to `0.0.0.0` and use from other devices on the LAN).
- **Production server:** Run Flask behind **Gunicorn** (Linux) or **Waitress** (Windows), and put **Nginx** or another reverse proxy in front. Set `--subcolonies` in the backend to match the server’s CPU count so the solver uses the processors.
- **Docker:** Dockerfile can build the C++ solver and run the Flask app; the process inside the container still uses the host’s CPUs (limit with `--cpus` if needed).

### 1b. Other web stacks

- **Node.js backend:** Run the solver with `child_process.spawn`; same idea: pass `--puzzle` and `--alg 2 --subcolonies N`, parse stdout, return JSON.
- **Any language (e.g. C#, Go, Java):** Same pattern: start the solver process, write puzzle to stdin or pass `--puzzle`, read stdout, parse success/solution/time, return to the frontend.

The **processors are used on the machine where the solver runs** (the web server). So deploy the web app on a multi-core server and set `subcolonies` accordingly.

---

## Option 2: Desktop application

**Idea:** A native or cross-platform GUI runs on the user’s PC and either calls the existing solver executable or links to the solver as a library. The multi-threaded solver then uses that **user’s** processors.

### 2a. Wrapper that runs the .exe / binary

This repo includes a **Tkinter desktop app** in `desktop/` that does exactly that:

- From repo root: `python desktop/sudoku_desktop.py`
- It finds the solver binary, lets you edit a 9×9 grid, and runs the solver with `--alg 2` and configurable **Sub-colonies** (threads). The solver runs in a background thread so the UI stays responsive. See `desktop/README.md`.

**Other tech options (if you want a different stack):**

- **Electron:** HTML/CSS/JS UI; Node.js runs the solver with `child_process`. Package as a desktop app; the solver binary must be shipped next to the app (or in resources).
- **Python + Tkinter / PyQt:** Same idea: GUI + subprocess to the solver. Good for a quick desktop app.
- **C# / WPF or WinForms:** Process.Start the solver, parse output, show in grid.
- **Qt (C++):** Integrate the solver as a library (see 2b) or run the executable from Qt and parse output.

In all cases, **set `--subcolonies` to the number of logical CPUs** (or slightly less) so the algorithm uses the user’s processors.

### 2b. Integrate solver as a library (advanced)

- Build the C++ solver as a **library** (e.g. DLL on Windows, .so on Linux) with a small C API: `solve(const char* puzzle, int timeout_sec, int subcolonies, ...)` that returns success and solution string.
- Call this from a GUI written in any language that can call C (C#, Python with ctypes, Node with N-API, etc.). No subprocess; the same process uses multiple threads (alg 2) and thus the machine’s processors.

---

## Option 3: Mobile app

- **Backend-based:** Mobile app sends the puzzle to **your web backend** (Option 1). The server runs the solver and uses the server’s processors; the app only displays the result.
- **On-device:** Port the C++ solver to the mobile platform (e.g. Android NDK, iOS native) and call it from the app; then the **device’s** CPUs are used. More work; same idea as desktop library integration.

---

## Summary

| Deployment type | How the solver runs | Where processors are used |
|-----------------|---------------------|----------------------------|
| **Web app**     | Backend runs solver (e.g. subprocess) with `--alg 2 --subcolonies N` | **Server** (set N to server CPU count) |
| **Desktop app** | GUI runs solver .exe or links solver library with alg 2 and N subcolonies | **User’s PC** (set N to PC CPU count) |
| **Mobile app**  | Either call your web API (server runs solver) or embed solver in app (device runs solver) | **Server** or **device** |

The **minimal web app** in `webapp/` is the quickest way to have a “deployed” application that uses multiple processors (on the machine where the web server runs). For a **desktop application**, use a GUI that launches the existing solver executable with `--alg 2 --subcolonies N` and parses its output.
