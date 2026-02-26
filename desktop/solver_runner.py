"""
Run the MT-ACS-RING C++ solver as a subprocess and parse its output.
Used by the desktop GUI; no GUI dependencies.
"""
from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]


def find_solver() -> Path:
    """Resolve solver binary (sudoku_ants.exe on Windows, sudokusolver elsewhere)."""
    if os.name == "nt":
        candidates = [
            REPO_ROOT / "sudoku_ants.exe",
            REPO_ROOT / "vs2017" / "x64" / "Release" / "sudoku_ants.exe",
            REPO_ROOT / "vs2017" / "Release" / "sudoku_ants.exe",
        ]
    else:
        candidates = [
            REPO_ROOT / "sudokusolver",
            REPO_ROOT / "sudoku_ants",
        ]
    for p in candidates:
        if p.is_file():
            return p
    raise FileNotFoundError(
        "Solver binary not found. Build it first (e.g. make -f markdowns/Makefile or VS Release)."
    )


def parse_verbose_stdout(stdout: str, order: int = 3) -> dict:
    """
    Parse solver verbose output for success, time, iterations, communication, and solution grid.
    order: 3 = 9x9.
    """
    out = {
        "success": None,
        "time": None,
        "iterations": None,
        "communication": None,
        "solution": None,
        "error": None,
    }
    num_cells = order ** 4
    lines = stdout.splitlines()

    for line in lines:
        m = re.search(r"solved in ([0-9]*\.?[0-9]+)", line)
        if m:
            out["success"] = True
            out["time"] = float(m.group(1))
        m = re.search(r"failed in time ([0-9]*\.?[0-9]+)", line)
        if m:
            out["success"] = False
            out["time"] = float(m.group(1))
        m = re.search(r"iterations:\s*([0-9]+)", line, re.I)
        if m:
            out["iterations"] = int(m.group(1))
        m = re.search(r"communication:\s*(yes|no)", line, re.I)
        if m:
            out["communication"] = m.group(1).lower() == "yes"

    if out["success"] is None:
        for i, line in enumerate(lines):
            line = line.strip()
            if line in ("0", "1"):
                out["success"] = line == "0"
                if i + 1 < len(lines):
                    try:
                        out["time"] = float(lines[i + 1].strip())
                    except ValueError:
                        pass
                break

    solution_start = None
    solution_end = None
    for i, line in enumerate(lines):
        if "Solution:" in line:
            solution_start = i + 1
        if solution_start is not None and "solved in" in line:
            solution_end = i
            break
    if solution_start is not None and solution_end is not None:
        block = " ".join(lines[solution_start:solution_end])
        # C++ solver uses AsString(true) → numbers: 9x9 prints 1-9, 16x16 prints 1-16 (e.g. "10","11"), 25x25 prints 1-25
        if order == 3:
            cells = re.findall(r"[1-9]", block)
            if len(cells) >= num_cells:
                out["solution"] = "".join(cells[:num_cells])
        else:
            # Multi-digit numbers: extract all integers, keep those in valid range, take first num_cells
            all_nums = re.findall(r"\d+", block)
            max_val = order * order  # 16 for order 4, 25 for order 5
            values = []
            for s in all_nums:
                n = int(s)
                if 1 <= n <= max_val:
                    values.append(n)
                    if len(values) == num_cells:
                        break
            if len(values) == num_cells:
                if order == 4:
                    # 1-10 -> '0'-'9', 11-16 -> 'a'-'f'
                    out["solution"] = "".join(
                        chr(ord("0") + v - 1) if v <= 10 else chr(ord("a") + v - 11)
                        for v in values
                    )
                else:  # order 5: 1-25 -> 'a'-'y'
                    out["solution"] = "".join(chr(ord("a") + v - 1) for v in values)
    return out


def read_instance_file(path: Path) -> tuple[int, str]:
    """
    Read an instance .txt file. Returns (order, puzzle_string).
    order 3 -> 81 chars (1-9, .), order 4 -> 256 chars (0-9,a-f,.), order 5 -> 625 (a-y,.).
    """
    text = path.read_text(encoding="utf-8", errors="replace")
    lines = [L.strip() for L in text.splitlines() if L.strip()]
    if len(lines) < 2:
        raise ValueError(f"Invalid instance file: need at least order and idum line")
    order = int(lines[0])
    if order not in (3, 4, 5):
        raise ValueError(f"Unsupported order {order}; use 3, 4, or 5")
    num_cells = order ** 4
    # Rest of file: space-separated values
    values = []
    for L in lines[2:]:
        for part in L.split():
            try:
                values.append(int(part))
            except ValueError:
                pass
    if len(values) < num_cells:
        raise ValueError(f"Instance has {len(values)} values, need {num_cells}")
    values = values[:num_cells]
    out = []
    for v in values:
        if v == -1:
            out.append(".")
        elif order == 3:
            out.append(chr(ord("1") + v - 1) if 1 <= v <= 9 else ".")
        elif order == 4:
            if 1 <= v <= 10:
                out.append(chr(ord("0") + v - 1))
            elif 11 <= v <= 16:
                out.append(chr(ord("a") + v - 11))
            else:
                out.append(".")
        else:  # order 5
            out.append(chr(ord("a") + v - 1) if 1 <= v <= 25 else ".")
    return order, "".join(out)


def run_solver_file(
    file_path: Path,
    timeout_sec: int = 120,
    subcolonies: int = 4,
    alg: int = 2,
) -> dict:
    """
    Run the solver with --file. Returns same dict as run_solver.
    file_path must be absolute or relative to REPO_ROOT.
    """
    path = Path(file_path)
    if not path.is_absolute():
        path = (REPO_ROOT / path).resolve()
    if not path.is_file():
        return {"success": False, "error": f"File not found: {path}"}
    try:
        order, _ = read_instance_file(path)
    except Exception as e:
        return {"success": False, "error": f"Could not read puzzle file: {e}"}
    solver_path = find_solver()
    # Use path relative to REPO_ROOT so the path has no spaces (avoids truncation on Windows when path contains "Original Repo", "Multi swarm", etc.)
    try:
        file_arg = path.resolve().relative_to(REPO_ROOT.resolve()).as_posix()
    except ValueError:
        file_arg = path.resolve().as_posix()
    cmd = [
        str(solver_path),
        "--file", file_arg,
        "--alg", str(alg),
        "--timeout", str(timeout_sec),
        "--verbose",
    ]
    if alg == 2:
        cmd.extend(["--subcolonies", str(subcolonies)])
    try:
        result = subprocess.run(
            cmd,
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            timeout=timeout_sec + 15,
        )
        stderr_text = (result.stderr or "").strip()
        parsed = parse_verbose_stdout(result.stdout or "", order=order)
        parsed["stderr"] = stderr_text
        # Solver exited without clear success/failure (e.g. "no puzzle specified" or "could not open file")
        if parsed["success"] is None:
            parsed["success"] = False
            parsed["error"] = stderr_text or f"Solver exited with code {result.returncode} and no result. Check that the puzzle file is valid."
        elif parsed.get("error") and stderr_text:
            parsed["error"] = parsed["error"] + "\n" + stderr_text
        return parsed
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "Solver timeout (exceeded limit)."}
    except FileNotFoundError as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        return {"success": False, "error": str(e)}


def run_solver(
    puzzle: str,
    timeout_sec: int = 120,
    subcolonies: int = 4,
    alg: int = 2,
    order: int | None = None,
) -> dict:
    """
    Run the solver with the given puzzle string.
    order: 3 = 9x9 (81 chars), 4 = 16x16 (256), 5 = 25x25 (625). Inferred from len(puzzle) if not set.
    Returns dict with success, solution, time, iterations, communication, error.
    """
    if order is None:
        if len(puzzle) == 81:
            order = 3
        elif len(puzzle) == 256:
            order = 4
        elif len(puzzle) == 625:
            order = 5
        else:
            return {"success": False, "error": "Puzzle length must be 81, 256, or 625"}
    else:
        expected = order ** 4
        if len(puzzle) != expected:
            return {"success": False, "error": f"Puzzle must be {expected} characters for order {order}"}
    solver_path = find_solver()
    cmd = [
        str(solver_path),
        "--puzzle", puzzle,
        "--alg", str(alg),
        "--timeout", str(timeout_sec),
        "--verbose",
    ]
    if alg == 2:
        cmd.extend(["--subcolonies", str(subcolonies)])
    try:
        result = subprocess.run(
            cmd,
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            timeout=timeout_sec + 15,
        )
        stderr_text = (result.stderr or "").strip()
        parsed = parse_verbose_stdout(result.stdout or "", order=order)
        parsed["stderr"] = stderr_text
        if result.returncode != 0 and parsed["success"] is None:
            parsed["success"] = False
            parsed["error"] = stderr_text or f"Exit code {result.returncode}"
        return parsed
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "Solver timeout (exceeded limit)."}
    except FileNotFoundError as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        return {"success": False, "error": str(e)}
