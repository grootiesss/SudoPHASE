"""
Minimal web app for the MT-ACS-RING Sudoku solver.
Serves a 9x9 grid UI and runs the C++ solver (with --alg 2 and --subcolonies) on the server.
Solver runs in a background thread so the server stays responsive; the C++ binary itself
uses multiple threads (subcolonies). Multithreaded implementation is retained.
"""
from __future__ import annotations

import os
import re
import subprocess
import threading
import uuid
from pathlib import Path
from flask import Flask, request, jsonify, render_template, send_from_directory

app = Flask(__name__)
REPO_ROOT = Path(__file__).resolve().parents[1]
INSTANCES_ROOT = REPO_ROOT / "instances"
CURATED_FOLDER = "curated-dataset"
SIZES = [("9×9", 3, 81), ("16×16", 4, 256), ("25×25", 5, 625)]

# In-memory job store: job_id -> { "status": "pending"|"done"|"error", "result": {...} }
_job_store: dict[str, dict] = {}
_job_store_lock = threading.Lock()


def _read_instance_file(path: Path) -> tuple[int, str]:
    """Read instance .txt; returns (order, puzzle_string). Same format as desktop solver_runner."""
    text = path.read_text(encoding="utf-8", errors="replace")
    lines = [L.strip() for L in text.splitlines() if L.strip()]
    if len(lines) < 2:
        raise ValueError("Invalid instance file: need at least order and idum line")
    order = int(lines[0])
    if order not in (3, 4, 5):
        raise ValueError(f"Unsupported order {order}; use 3, 4, or 5")
    num_cells = order ** 4
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
        else:
            out.append(chr(ord("a") + v - 1) if 1 <= v <= 25 else ".")
    return order, "".join(out)


def _list_library() -> dict:
    """List .txt files in instances/curated-dataset by size. Returns { "9×9": [{name, path}], ... }."""
    folder = INSTANCES_ROOT / CURATED_FOLDER
    by_size: dict[str, list[dict]] = {label: [] for label, _, _ in SIZES}
    if not folder.is_dir():
        return by_size
    for path in sorted(folder.glob("*.txt")):
        try:
            order, _ = _read_instance_file(path)
            label = SIZES[order - 3][0]
            by_size[label].append({"name": path.name, "path": f"{CURATED_FOLDER}/{path.name}"})
        except Exception:
            pass
    return by_size


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
    order: 3 = 9x9, 4 = 16x16, 5 = 25x25.
    """
    out = {
        "success": None,
        "time": None,
        "iterations": None,
        "communication": None,
        "solution": None,
        "raw_error": None,
    }
    # Solution grid size
    num_cells = order ** 4  # 81, 256, 625
    if order == 3:
        cell_pattern = re.compile(r"[1-9]")
    elif order == 4:
        cell_pattern = re.compile(r"[0-9a-fA-F]")
    else:
        cell_pattern = re.compile(r"[a-yA-Y]")

    lines = stdout.splitlines()

    # Success/time from verbose lines
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

    # Non-verbose fallback: "0" or "1" then time
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

    # Extract solution grid: between "Solution:" and "solved in"
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
        if order == 3:
            cells = cell_pattern.findall(block)
            if len(cells) >= num_cells:
                out["solution"] = "".join(cells[:num_cells])
        else:
            # C++ prints numbers: 16×16 prints 1-16, 25×25 prints 1-25
            all_nums = re.findall(r"\d+", block)
            max_val = order * order
            values = [int(s) for s in all_nums if 1 <= int(s) <= max_val][:num_cells]
            if len(values) == num_cells:
                if order == 4:
                    out["solution"] = "".join(
                        chr(ord("0") + v - 1) if v <= 10 else chr(ord("a") + v - 11)
                        for v in values
                    )
                else:
                    out["solution"] = "".join(chr(ord("a") + v - 1) for v in values)

    return out


def _run_solver_sync(puzzle: str, timeout: int, subcolonies: int, alg: int, order: int = 3) -> dict:
    """Run C++ solver in current thread. Returns result dict for one job."""
    try:
        solver_path = find_solver()
    except FileNotFoundError as e:
        return {"status": "error", "result": {"error": str(e)}}
    cmd = [
        str(solver_path),
        "--puzzle", puzzle,
        "--alg", str(alg),
        "--timeout", str(timeout),
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
            timeout=timeout + 15,
        )
        parsed = parse_verbose_stdout(result.stdout or "", order=order)
        if result.returncode != 0 and parsed["success"] is None:
            parsed["raw_error"] = (result.stderr or result.stdout or "").strip() or f"Exit code {result.returncode}"
        return {
            "status": "done",
            "result": {
                "success": parsed["success"],
                "solution": parsed["solution"],
                "time": parsed["time"],
                "iterations": parsed["iterations"],
                "communication": parsed["communication"],
                "error": parsed.get("raw_error"),
            },
        }
    except subprocess.TimeoutExpired:
        return {"status": "error", "result": {"error": "Solver timeout"}}
    except Exception as e:
        return {"status": "error", "result": {"error": str(e)}}


def _worker(job_id: str, puzzle: str, timeout: int, subcolonies: int, alg: int, order: int) -> None:
    """Background thread: run solver and store result."""
    try:
        outcome = _run_solver_sync(puzzle, timeout, subcolonies, alg, order)
    except Exception as e:
        outcome = {"status": "error", "result": {"error": str(e)}}
    with _job_store_lock:
        _job_store[job_id] = outcome


@app.route("/")
def menu():
    return render_template("menu.html")


@app.route("/play")
def play_page():
    return render_template("index.html")


@app.route("/create")
def create_page():
    return render_template("create.html")


@app.route("/about")
def about_page():
    return render_template("about.html")


@app.route("/logo")
def logo():
    """Serve SudoPhase_Logo.png from webapp (templates or root)."""
    directory = Path(app.root_path)
    for name in ("SudoPhase_Logo.png", "templates/SudoPhase_Logo.png"):
        path = directory / name
        if path.is_file():
            return send_from_directory(directory, name)
    return send_from_directory(directory, "static/logo.png")


@app.route("/api/library", methods=["GET"])
def library():
    """GET /api/library -> { "9×9": [{name, path}], "16×16": [...], "25×25": [...] } from instances/curated-dataset."""
    return jsonify(_list_library())


@app.route("/api/instance/<path:filename>", methods=["GET"])
def get_instance(filename: str):
    """GET /api/instance/curated-dataset/foo.txt or /api/instance/foo.txt -> { order, puzzle }."""
    parts = filename.replace("\\", "/").strip("/").split("/")
    if any(p in ("", ".", "..") for p in parts):
        return jsonify({"error": "Invalid filename"}), 400
    if len(parts) == 1:
        path = (INSTANCES_ROOT / CURATED_FOLDER / parts[0]).resolve()
    else:
        if parts[0] != CURATED_FOLDER:
            return jsonify({"error": "Only curated-dataset instances are allowed"}), 400
        path = (INSTANCES_ROOT / Path(*parts)).resolve()
    curated = (INSTANCES_ROOT / CURATED_FOLDER).resolve()
    if not path.is_file() or not str(path).startswith(str(curated)):
        return jsonify({"error": "Instance not found"}), 404
    try:
        order, puzzle = _read_instance_file(path)
        return jsonify({"order": order, "puzzle": puzzle})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/solve", methods=["POST"])
def solve():
    """
    POST JSON: { "puzzle": "...", "timeout": 120, "subcolonies": 4, "alg": 2 }
    Starts the C++ solver in a background thread (multithreaded: subcolonies inside C++).
    Returns: { "job_id": "..." }. Poll GET /api/status/<job_id> for result.
    """
    try:
        data = request.get_json() or {}
        puzzle = (data.get("puzzle") or "").strip()
        if not puzzle:
            return jsonify({"error": "Missing or empty 'puzzle'"}), 400
        order = int(data.get("order", 3))
        expected_len = order ** 4
        if len(puzzle) != expected_len:
            return jsonify({"error": f"Puzzle must be {expected_len} characters for order {order}"}), 400
        timeout = int(data.get("timeout", 120))
        subcolonies = int(data.get("subcolonies", 4))
        alg = int(data.get("alg", 2))

        job_id = str(uuid.uuid4())
        with _job_store_lock:
            _job_store[job_id] = {"status": "pending", "result": None}

        t = threading.Thread(
            target=_worker,
            args=(job_id, puzzle, timeout, subcolonies, alg, order),
            daemon=True,
        )
        t.start()

        return jsonify({"job_id": job_id}), 202
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/status/<job_id>", methods=["GET"])
def status(job_id: str):
    """
    GET /api/status/<job_id>
    Returns: { "status": "pending"|"done"|"error", "result": {...} when not pending }
    """
    with _job_store_lock:
        job = _job_store.get(job_id)
    if not job:
        return jsonify({"error": "Unknown job_id"}), 404
    return jsonify(job)


if __name__ == "__main__":
    import sys
    host = "0.0.0.0" if "--public" in sys.argv else "127.0.0.1"
    app.run(host=host, port=5000, debug=False)
