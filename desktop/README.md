# Desktop application (MT-ACS-RING Sudoku Solver)

A **Tkinter** desktop app that shows a **puzzle library** and **sizes (9×9, 16×16, 25×25)**. It runs the C++ solver and uses multiple processors via **Sub-colonies** (threads).

## Requirements

- **Python 3** with **Tkinter** (usually included; on Linux you may need `python3-tk`).
- The solver built and available from the repo root:
  - **Windows:** Build **Release | x64** in Visual Studio → `vs2017\x64\Release\sudoku_ants.exe`, or copy it to the repo root.
  - **Linux / WSL:** `make -f markdowns/Makefile` → `sudokusolver` in repo root.
- The **instances** folder (repo `instances/`) for the puzzle library. If missing, the library list will be empty; you can still type puzzles manually.

## Run

From the **repository root**:

```bash
python desktop/sudoku_desktop.py
```

Or from inside `desktop/`:

```bash
cd desktop
python sudoku_desktop.py
```

## Usage

1. **Size** (top left): Choose **9×9**, **16×16**, or **25×25**. The grid and the library list update to that size.
2. **Puzzle library** (left): Lists puzzles from `instances/general`, `instances/logic-solvable`, `instances/9x9-database`, `instances/16x16-database`, `instances/25x25-database`, and `instances/curated-dataset`. Select a puzzle and click **Load selected puzzle** (or double‑click the row).
3. **Grid** (right): View or edit the puzzle. Set **Timeout (s)** and **Sub-colonies (threads)** (e.g. match your CPU count), then click **Solve**. The solver runs in a background thread; the grid and status update when it finishes.
4. **Clear** clears the grid and lets you enter a puzzle manually.

No browser or web server required; the solver runs locally and uses your machine’s cores.
