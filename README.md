<<<<<<< HEAD
# MT-CP-ACS-SA: Multi-Threaded ACO-SA for Sudoku

A C++ Sudoku solver based on **Ant Colony Optimization (ACS)** with **Simulated Annealing (SA)** and **parallel multi-colony** search. The parallel variant uses a ring topology and random matching for pheromone exchange between sub-colonies (RMACO-style).
=======
# MT-ACS-RING: Multi-Threaded Ant Colony System for Sudoku

A C++ Sudoku solver based on **Ant Colony Optimization (ACS)** with **Simulated Annealing (SA)** and optional **parallel multi-colony** search. The parallel variant uses a ring topology and random matching for pheromone exchange between sub-colonies (RMACO-style).
>>>>>>> dedef782b (Add webapp UI and deployment assets)

## Description

This project implements three solving methods:

| Algorithm | Description |
|-----------|-------------|
<<<<<<< HEAD
| **0** | Single-colony Ant Colony System (ACS) with optional SA (modified). Lloyd & Amos, IEEE Trans. on Games (2021). |
| **1** | Exact backtracking search (reference / validation). |
| **2** | **Parallel ACS**: multiple colonies in separate threads; ring + random topology; three-source pheromone update; adaptive exchange interval. Yang et al., "RMACO: a randomly matched parallel ant colony optimization," World Wide Web (2016). |
=======
| **0** | Single-colony Ant Colony System (ACS) with optional SA. Lloyd & Amos, IEEE Trans. on Games (2021). |
| **1** | Exact backtracking search (reference / validation). |
| **2** | **Parallel ACS**: multiple sub-colonies in separate threads; ring + random topology; three-source pheromone update; adaptive exchange interval. Yang et al., "RMACO: a randomly matched parallel ant colony optimization," World Wide Web (2016). |
>>>>>>> dedef782b (Add webapp UI and deployment assets)

Features:

- **9×9, 16×16, and 25×25** Sudoku (order 3, 4, 5).
- **Simulated Annealing**: optional application every `safreq` iterations (`--safreq`); conservative/hybrid or always-accept (CP-like) via `--saAccept`.
- **Command-line** and **file-based** puzzle input; batch runs via the included Python script.
<<<<<<< HEAD
=======
- **Web app**: a minimal Flask app in `webapp/` lets you solve 9×9 puzzles in the browser; the solver runs on the server and uses multiple processors (see **Deploying as web/desktop app** below).
>>>>>>> dedef782b (Add webapp UI and deployment assets)

## Dataset

Puzzle instances are under the `instances/` directory:

| Folder | Description |
|--------|-------------|
| `instances/general` | General logic-solvable instances (`.txt`). |
| `instances/logic-solvable` | Logic-solvable puzzles. |
| `instances/9x9-database` | 9×9 instance set (e.g. `9x9_00001.txt`, ranges). |
| `instances/16x16-database` | 16×16 instance set (e.g. `16x16_02203.txt`). |
| `instances/25x25-database` | 25×25 instance set. |
<<<<<<< HEAD
| `instances/curated-dataset` | Optional curated dataset (used on conference paper proposal). |
=======
| `instances/curated-dataset` | Optional curated dataset (may be provided as a zip). |
>>>>>>> dedef782b (Add webapp UI and deployment assets)

**Puzzle file format (for `--file`):**

- Line 1: **order** (e.g. `3` for 9×9, `4` for 16×16, `5` for 25×25).
<<<<<<< HEAD
- Line 2: unused integer (e.g. `0`) but was originially used as the fixed-cell percentage value (Lloyd and Amos).
=======
- Line 2: unused integer (e.g. `0`).
>>>>>>> dedef782b (Add webapp UI and deployment assets)
- Remaining: space-separated **cell values** in row-major order:
  - `-1` = empty cell
  - `1`–`9` for 9×9 → digits `1`–`9`
  - For 16×16: `1`–`10` → `0`–`9`, `11`–`16` → `a`–`f`
  - For 25×25: `1`–`25` → `a`–`y`

Example (9×9, first line “3”, second “0”, then 81 values with `-1` for blanks):

```
3
0
-1 -1 3 -1 2 -1 -1 -1 -1
...
```

## Building

**Requirements:** C++11 compiler (e.g. `g++`) with `pthread` support.

1. From the **repository root**:

   ```bash
   mkdir -p obj
   make -f markdowns/Makefile
   ```

<<<<<<< HEAD
The makefile uses g++ to compile. However, any C++ compiler should work, as long as it supports the C++11 standard.

Alternatively, for windows, there is a Visual Studio 2017 project file in the vs2017 folder.
=======
2. The executable is produced as **`sudokusolver`** in the project root.

**Windows (PowerShell):**

```powershell
New-Item -ItemType Directory -Force -Path obj
make -f markdowns/Makefile
```
>>>>>>> dedef782b (Add webapp UI and deployment assets)

If you use a Visual Studio build that produces `sudoku_ants.exe`, place it in the repo root or under `vs2017/x64/Release/` (or set the script’s `--solver`; see below).

## Command-line arguments

All options use a double-dash prefix, e.g. `--file`, `--alg`.

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--file` | string | — | Path to puzzle file (order + idum + cell values). |
| `--puzzle` | string | — | One-line puzzle string (e.g. digits and `.` for empty). Alternative to `--file`. |
| `--order` | int | — | Order of the grid (e.g. 3 = 9×9). Used with `--blank` for an empty grid. |
| `--blank` | flag | 0 | If set with `--order`, use a blank puzzle. |
| `--alg` | int | 0 | Solver: **0** = ACS, **1** = backtracking, **2** = parallel ACS. |
| `--timeout` | int | 120 | Time limit in seconds. |
| `--ants` | int | 10 | Number of ants (alg 0 and 2). |
<<<<<<< HEAD
| `--subcolonies` | int | 4 | Number of colonies (alg 2 only), naming convention "subcolonies" was not still changed to "colonies". |
=======
| `--subcolonies` | int | 4 | Number of sub-colonies (alg 2 only). |
>>>>>>> dedef782b (Add webapp UI and deployment assets)
| `--q0` | float | 0.9 | ACS exploitation probability. |
| `--rho` | float | 0.9 | ACS pheromone decay (global update). |
| `--evap` | float | 0.005 | Best-so-far evaporation (e.g. best-evap). |
| `--safreq` | int | 0 | Apply SA every N iterations (0 = disabled). |
| `--saAccept` | int | 0 | **0** = conservative/hybrid, **1** = always accept SA result (CP-like). |
| `--verbose` | flag | 0 | Print solution grid, time, iterations. |
| `--showinitial` | flag | 0 | Print initial constrained grid before solving. |

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

**Parallel ACS with more sub-colonies and SA:**
```bash
./sudokusolver --file instances/9x9-database/9x9_00001.txt --alg 2 --subcolonies 8 --ants 10 --safreq 100 --timeout 120 --verbose
```

**Backtracking (exact) for validation:**
```bash
./sudokusolver --file instances/general/example.txt --alg 1 --verbose
```

## Built-in script: `run_general.py`

The script `scripts/run_general.py` runs the solver on many instances and writes CSV metrics.

**Solver binary:** The script looks for `sudoku_ants` (or `sudoku_ants.exe` on Windows) in the repo root or under `vs2017/`. If you built with the Makefile you get `sudokusolver`; either copy/symlink it to `sudoku_ants` or pass the path explicitly:

```bash
python scripts/run_general.py --solver ./sudokusolver --alg 2 --verbose
```

**Examples:**

```bash
# Default: run all general + logic-solvable + database instances, alg 0, write results/general_metrics.csv
python scripts/run_general.py --solver ./sudokusolver --verbose

# Parallel ACS (alg 2), custom timeout and output CSV
python scripts/run_general.py --solver ./sudokusolver --alg 2 --timeout 60 --output results/alg2_60s.csv --verbose

# Only 9×9 database, instance range
python scripts/run_general.py --instances-root instances/9x9-database --range-start 9x9_00001 --range-end 9x9_00100 --output results/9x9_001_100.csv --solver ./sudokusolver

# Only 16×16 database, instance range
python scripts/run_general.py --instances-root instances/16x16-database --range-start 16x16_02203 --range-end 16x16_02436 --output results/16x16.csv --solver ./sudokusolver

# Filter by puzzle size and fixed-cell percentage
python scripts/run_general.py --puzzle-size 9x9 --fixed-percentage 40 45 --solver ./sudokusolver --output results/9x9_40_45.csv

# Limit number of instances and set SA parameters (alg 0 or 2)
python scripts/run_general.py --solver ./sudokusolver --alg 2 --safreq 100 --saAccept 0 --limit 50 --output results/limited.csv
```

**Useful script options:**

| Option | Description |
|--------|-------------|
| `--solver` | Path to solver executable (e.g. `./sudokusolver`). |
| `--instances-root` | Use only this folder (e.g. `instances/9x9-database`). |
| `--alg` | 0 = ACS, 1 = backtracking, 2 = parallel ACS. |
| `--timeout` | Timeout per puzzle (seconds). |
| `--output` | Output CSV path. |
| `--range-start`, `--range-end` | Filter instances by name (e.g. `9x9_00004`–`9x9_00483`). |
| `--puzzle-size` | Filter by size: `9x9`, `16x16`, `25x25`. |
| `--fixed-percentage` | Filter by fixed-cell percentage(s). |
| `--limit` | Max number of instances to run. |
| `--verbose` / `--no-verbose` | Per-instance progress. |
| `--ants`, `--subcolonies`, `--q0`, `--rho`, `--evap`, `--safreq`, `--saAccept` | Passed through to the solver. |

## Example: single puzzle from file

If you have a file `instances/general/my_puzzle.txt` in the format above:

```bash
# From repository root
./sudokusolver --file instances/general/my_puzzle.txt --alg 2 --subcolonies 4 --timeout 120 --verbose
```

Successful run (verbose) will print the solution grid, solve time, iteration count, and for alg 2 whether communication occurred.

<<<<<<< HEAD
=======
## Deploying as web or desktop application

- **Web app:** From the repo root, run `pip install -r webapp/requirements.txt` and `python webapp/app.py`, then open http://127.0.0.1:5000. The solver runs on the server with `--alg 2` and uses the **Sub-colonies** setting (threads) to exploit multiple processors.
- **Desktop app:** From the repo root, run `python desktop/sudoku_desktop.py`. A Tkinter window opens with a 9×9 grid; set **Sub-colonies** to your CPU count and click **Solve**. No browser or server needed; the solver runs locally. See `desktop/README.md`.
- **Other stacks:** See `markdowns/DEPLOYMENT_APP.md` for production deployment, Electron, Qt, mobile, etc.

>>>>>>> dedef782b (Add webapp UI and deployment assets)
## References

- Lloyd & Amos, IEEE Trans. on Games (2021) — ACS core for Sudoku.
- Yang et al., "RMACO: a randomly matched parallel ant colony optimization," World Wide Web (2016) — ring + random topology, three-source update, adaptive interval.
- See `ACO_PAPER_VERIFICATION.md` and `RMACO_PARALLEL_ADAPTATION.md` in the repo for algorithm details.
