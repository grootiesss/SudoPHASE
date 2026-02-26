"""
Desktop application for the MT-ACS-RING Sudoku solver.
Shows puzzle library and sizes (9×9, 16×16, 25×25). Runs the C++ solver in a background thread.
"""
from __future__ import annotations

import sys
import threading
import tkinter as tk
from pathlib import Path
from tkinter import ttk, messagebox, font as tkfont

_desktop_dir = Path(__file__).resolve().parent
if str(_desktop_dir) not in sys.path:
    sys.path.insert(0, str(_desktop_dir))
from solver_runner import run_solver, run_solver_file, read_instance_file

REPO_ROOT = _desktop_dir.parent
INSTANCES_ROOT = REPO_ROOT / "instances"

# Size options: (label, order, num_cells)
SIZES = [
    ("9×9", 3, 81),
    ("16×16", 4, 256),
    ("25×25", 5, 625),
]
# Characters allowed per cell (for grid validation). Orders 4 and 5 use digits 1-16 and 1-25.
CELL_CHARS = {3: "123456789", 4: None, 5: None}

# Puzzle library: only curated-dataset (order/size read from each file)
CURATED_FOLDER = "curated-dataset"
LIBRARY_DISPLAY_NAME = "Curated dataset"


def list_library() -> list[tuple[str, str, Path]]:
    """Returns list of (size_label, display_name, path) for each .txt in instances/curated-dataset."""
    items = []
    folder = INSTANCES_ROOT / CURATED_FOLDER
    if not folder.is_dir():
        return items
    for path in sorted(folder.glob("*.txt")):
        try:
            order, _ = read_instance_file(path)
            size_label = SIZES[order - 3][0]
            items.append((size_label, f"{LIBRARY_DISPLAY_NAME} / {path.name}", path))
        except Exception:
            pass
    return items


def main():
    root = tk.Tk()
    root.title("SudoPHASE")
    root.resizable(True, True)
    root.minsize(720, 520)

    style = ttk.Style()
    if "clam" in style.theme_names():
        style.theme_use("clam")

    main_frame = ttk.Frame(root, padding=10)
    main_frame.grid(row=0, column=0, sticky="nsew")
    root.columnconfigure(0, weight=1)
    root.rowconfigure(0, weight=1)
    main_frame.columnconfigure(1, weight=1)
    main_frame.rowconfigure(1, weight=1)

    # ---- Left: Puzzle library (curated-dataset only) and size ----
    left = ttk.LabelFrame(main_frame, text="Puzzle library (instances/curated-dataset) & size", padding=8)
    left.grid(row=0, column=0, rowspan=2, sticky="nsew", padx=(0, 10))
    main_frame.columnconfigure(0, weight=0)

    ttk.Label(left, text="Size:", font=("", 10, "bold")).grid(row=0, column=0, sticky="w", pady=(0, 4))
    size_var = tk.StringVar(value="9×9")
    size_combo = ttk.Combobox(left, textvariable=size_var, values=[s[0] for s in SIZES], state="readonly", width=10)
    size_combo.grid(row=1, column=0, sticky="ew", pady=(0, 12))
    left.columnconfigure(0, weight=1)

    ttk.Label(left, text="Available puzzles:", font=("", 10, "bold")).grid(row=2, column=0, sticky="w", pady=(0, 4))
    library_listbox = tk.Listbox(left, height=10, width=28, selectmode="single", font=("", 9))
    library_listbox.grid(row=3, column=0, sticky="nsew", pady=(0, 4))
    scroll_lib = ttk.Scrollbar(left, orient="vertical", command=library_listbox.yview)
    scroll_lib.grid(row=3, column=1, sticky="ns")
    library_listbox.config(yscrollcommand=scroll_lib.set)

    load_btn = ttk.Button(left, text="Load selected puzzle")
    load_btn.grid(row=4, column=0, columnspan=2, pady=4, sticky="ew")
    library_listbox.bind("<Double-Button-1>", lambda e: do_load())

    ttk.Label(left, text="Timeout (s):", font=("", 9)).grid(row=5, column=0, sticky="w", pady=(8, 2))
    timeout_var = tk.StringVar(value="120")
    ttk.Spinbox(left, from_=5, to=600, width=6, textvariable=timeout_var).grid(row=6, column=0, sticky="w", pady=(0, 6))
    ttk.Label(left, text="Threads (colonies):", font=("", 9)).grid(row=7, column=0, sticky="w", pady=(0, 2))
    subcolonies_var = tk.StringVar(value="4")
    ttk.Spinbox(left, from_=1, to=32, width=6, textvariable=subcolonies_var).grid(row=8, column=0, sticky="w", pady=(0, 4))

    # ---- Right top: Grid area ----
    right = ttk.Frame(main_frame)
    right.grid(row=0, column=1, sticky="nsew", padx=10)
    ttk.Label(right, text="SudoPHASE", font=("", 12, "bold")).grid(row=0, column=0, pady=(0, 2))
    ttk.Label(right, text="Multithreaeded ACOSA Sudoku Solver", font=("", 9), foreground="gray").grid(row=1, column=0, pady=(0, 8))

    grid_container = ttk.Frame(right)
    grid_container.grid(row=2, column=0, pady=8)
    entries_by_order: dict[int, list[list[tk.Entry]]] = {}

    btn_frame = ttk.Frame(right)
    btn_frame.grid(row=3, column=0, pady=6)
    solve_btn = ttk.Button(btn_frame, text="Solve")
    solve_btn.grid(row=0, column=0, padx=4)
    clear_btn = ttk.Button(btn_frame, text="Clear")
    clear_btn.grid(row=0, column=1, padx=4)

    status_var = tk.StringVar(value="Select a size and load a puzzle, or enter one manually.")
    status_label = ttk.Label(right, textvariable=status_var, wraplength=400, justify="center")
    status_label.grid(row=4, column=0, pady=4)
    # Clarify where solving runs and 16×16 symbol meaning
    backend_note = ttk.Label(
        right,
        text="Solving runs in the backend (C++ solver). Timeout limits how long it may run. When a solution is found, the complete solution is shown in the grid above.",
        font=("", 8),
        foreground="gray",
        wraplength=420,
        justify="center",
    )
    backend_note.grid(row=5, column=0, pady=(0, 4))
    size_note_var = tk.StringVar(value="")
    size_note_label = ttk.Label(right, textvariable=size_note_var, font=("", 8), foreground="gray", wraplength=420, justify="center")
    size_note_label.grid(row=6, column=0, pady=(0, 8))

    # State
    current_order = 3
    current_entries: list[list[tk.Entry]] = []
    loaded_file_path: Path | None = None
    library_data: list[tuple[str, str, Path]] = []

    def get_order():
        return next((s[1] for s in SIZES if s[0] == size_var.get()), 3)

    def get_cells():
        return SIZES[get_order() - 3][2]

    def build_grid(order: int):
        nonlocal current_entries
        for w in grid_container.winfo_children():
            w.destroy()
        grid_frame = ttk.Frame(grid_container)
        grid_frame.grid(row=0, column=0)
        n = order * order
        if order == 3:
            font_size = 14
            cell_width = 2
            ipadx, ipady = 4, 4
            pad_base = 2
        elif order == 4:
            font_size = 11
            cell_width = 2
            ipadx, ipady = 2, 2
            pad_base = 2
        else:
            font_size = 10
            cell_width = 2
            ipadx, ipady = 2, 2
            pad_base = 2
        entry_font = tkfont.Font(family="Consolas", size=font_size)
        if "Consolas" not in entry_font.actual("family"):
            entry_font = tkfont.Font(size=font_size)
        current_entries = []
        pad_extra = 4 if order in (2, 5) else 2
        for row in range(n):
            row_entries = []
            for col in range(n):
                e = tk.Entry(grid_frame, width=cell_width, justify="center", font=entry_font, relief="solid", borderwidth=1)
                padx = (pad_base, pad_extra if col in [order - 1, 2 * order - 1] else pad_base)
                pady = (pad_base, pad_extra if row in [order - 1, 2 * order - 1] else pad_base)
                e.grid(row=row, column=col, padx=padx, pady=pady, ipadx=ipadx, ipady=ipady)
                row_entries.append(e)
            current_entries.append(row_entries)
        entries_by_order[order] = current_entries

    def refresh_library():
        nonlocal library_data
        library_data = list_library()
        sel_size = size_var.get()
        library_listbox.delete(0, tk.END)
        for size_label, display_name, _ in library_data:
            if size_label == sel_size:
                library_listbox.insert(tk.END, display_name)
        library_paths_for_size = [p for sl, _, p in library_data if sl == sel_size]
        library_listbox.paths = library_paths_for_size
        if not library_data and (INSTANCES_ROOT / CURATED_FOLDER).is_dir():
            library_listbox.insert(tk.END, "(no .txt puzzles in curated-dataset)")
        elif not (INSTANCES_ROOT / CURATED_FOLDER).is_dir():
            library_listbox.insert(tk.END, f"(create folder instances/{CURATED_FOLDER})")

    def on_size_change(*_):
        order = get_order()
        nonlocal current_order, loaded_file_path
        current_order = order
        loaded_file_path = None
        build_grid(order)
        refresh_library()
        status_var.set(f"Size set to {size_var.get()}. Load a puzzle or enter manually.")
        if order == 4:
            size_note_var.set("16×16: values 1–16 are shown as digits 1–16.")
            root.geometry("975x900")
        elif order == 5:
            size_note_var.set("25×25: values 1–25 are shown as digits 1–25.")
            root.update_idletasks()
            root.geometry("975x900")
        else:
            size_note_var.set("")
            root.geometry("975x900")

    size_var.trace_add("write", on_size_change)

    def _order4_val_to_char(val: str) -> str:
        try:
            n = int(val)
            if 1 <= n <= 10:
                return chr(ord("0") + n - 1)
            if 11 <= n <= 16:
                return chr(ord("a") + n - 11)
        except ValueError:
            pass
        return "."

    def _order5_val_to_char(val: str) -> str:
        try:
            n = int(val)
            if 1 <= n <= 25:
                return chr(ord("a") + n - 1)
        except ValueError:
            pass
        return "."

    def grid_to_puzzle() -> str:
        order = get_order()
        n = order * order
        chars = CELL_CHARS[order]
        out = []
        for r in range(n):
            for c in range(n):
                v = current_entries[r][c].get().strip()
                if order == 4:
                    out.append(_order4_val_to_char(v))
                elif order == 5:
                    out.append(_order5_val_to_char(v))
                elif v and v in chars:
                    out.append(v)
                else:
                    out.append(".")
        return "".join(out)

    def _order4_char_to_display(ch: str) -> str:
        if ch == ".":
            return ""
        if "0" <= ch <= "9":
            return str(ord(ch) - ord("0") + 1)
        if "a" <= ch <= "f":
            return str(ord(ch) - ord("a") + 11)
        return ""

    def _order5_char_to_display(ch: str) -> str:
        if ch == ".":
            return ""
        if "a" <= ch <= "y":
            n = ord(ch) - ord("a") + 1
            return str(n)
        return ""

    def puzzle_to_grid(puzzle: str):
        order = get_order()
        n = order * order
        cells = get_cells()
        p = (puzzle + "." * cells)[:cells]
        for r in range(n):
            for c in range(n):
                idx = r * n + c
                ch = p[idx]
                current_entries[r][c].delete(0, tk.END)
                if order == 4:
                    current_entries[r][c].insert(0, _order4_char_to_display(ch))
                elif order == 5:
                    current_entries[r][c].insert(0, _order5_char_to_display(ch))
                else:
                    current_entries[r][c].insert(0, ch if ch != "." else "")

    def set_solution(puzzle: str, solution: str):
        order = get_order()
        n = order * order
        cells = get_cells()
        p = (puzzle + "." * cells)[:cells]
        sol = (solution + "." * cells)[:cells]
        chars = CELL_CHARS[order]
        for r in range(n):
            for c in range(n):
                idx = r * n + c
                if order == 4:
                    val = _order4_char_to_display(sol[idx])
                elif order == 5:
                    val = _order5_char_to_display(sol[idx])
                else:
                    val = sol[idx] if sol[idx] != "." and sol[idx] in chars else ""
                current_entries[r][c].delete(0, tk.END)
                current_entries[r][c].insert(0, val)

    def do_load():
        sel = library_listbox.curselection()
        if not sel:
            messagebox.showinfo("Load", "Select a puzzle from the list first.")
            return
        idx = sel[0]
        paths = getattr(library_listbox, "paths", [])
        if idx >= len(paths):
            return
        path = paths[idx]
        try:
            order, puzzle = read_instance_file(path)
            nonlocal loaded_file_path, current_order
            loaded_file_path = path
            if order != get_order():
                size_var.set(SIZES[order - 3][0])
                current_order = order
                build_grid(order)
                refresh_library()
            puzzle_to_grid(puzzle)
            status_var.set(f"Loaded: {path.name}")
        except Exception as e:
            messagebox.showerror("Load error", str(e))

    def do_clear():
        nonlocal loaded_file_path
        loaded_file_path = None
        puzzle_to_grid("." * get_cells())
        status_var.set("Grid cleared. Load a puzzle or enter manually.")

    def worker_use_file():
        path = loaded_file_path
        if not path:
            return
        result = run_solver_file(
            path,
            timeout_sec=int(timeout_var.get() or 120),
            subcolonies=int(subcolonies_var.get() or 4),
            alg=2,
        )
        order = current_order
        puzzle = grid_to_puzzle()

        def on_done():
            solve_btn.config(state=tk.NORMAL)
            if result.get("error"):
                status_var.set("Error: " + result["error"])
                messagebox.showerror("Solver error", result["error"])
                return
            if result.get("success") and result.get("solution"):
                set_solution(puzzle, result["solution"])
                t = result.get("time")
                it = result.get("iterations")
                comm = result.get("communication")
                msg = f"Solution found. Complete solution displayed in grid above. Time: {t:.2f} s" + (f" · {it} iterations" if it is not None else "") + (f" · communication: {'yes' if comm else 'no'}" if comm is not None else "")
                status_var.set(msg)
            else:
                t = result.get("time")
                it = result.get("iterations")
                stderr = result.get("stderr", "")
                msg = f"No solution found." + (f" Time used: {t:.2f} s" if t is not None else "")
                if it is not None:
                    msg += f" · {it} iterations"
                msg += ". Try increasing timeout or sub-colonies."
                if stderr:
                    msg += f" Backend: {stderr}"
                status_var.set(msg)

        root.after(0, on_done)

    def worker_use_puzzle():
        try:
            timeout = int(timeout_var.get() or 120)
            subcol = int(subcolonies_var.get() or 4)
        except ValueError:
            root.after(0, lambda: messagebox.showerror("Error", "Invalid timeout or subcolonies."))
            root.after(0, lambda: (solve_btn.config(state=tk.NORMAL), status_var.set("Enter a puzzle and click Solve.")))
            return
        puzzle = grid_to_puzzle()
        if puzzle.count(".") == 0:
            root.after(0, lambda: messagebox.showinfo("Info", "Grid is already full."))
            root.after(0, lambda: solve_btn.config(state=tk.NORMAL))
            return
        result = run_solver(puzzle, timeout_sec=timeout, subcolonies=subcol, alg=2, order=current_order)

        def on_done():
            solve_btn.config(state=tk.NORMAL)
            if result.get("error"):
                status_var.set("Error: " + result["error"])
                messagebox.showerror("Solver error", result["error"])
                return
            if result.get("success") and result.get("solution"):
                set_solution(puzzle, result["solution"])
                t = result.get("time")
                it = result.get("iterations")
                comm = result.get("communication")
                msg = f"Solution found. Complete solution displayed in grid above. Time: {t:.2f} s" + (f" · {it} iterations" if it is not None else "") + (f" · communication: {'yes' if comm else 'no'}" if comm is not None else "")
                status_var.set(msg)
            else:
                t = result.get("time")
                it = result.get("iterations")
                stderr = result.get("stderr", "")
                msg = f"No solution found." + (f" Time used: {t:.2f} s" if t is not None else "")
                if it is not None:
                    msg += f" · {it} iterations"
                msg += ". Try increasing timeout or sub-colonies."
                if stderr:
                    msg += f" Backend: {stderr}"
                status_var.set(msg)

        root.after(0, on_done)

    def do_solve():
        if grid_to_puzzle().count(".") == 0:
            messagebox.showinfo("Info", "Grid is already full.")
            return
        try:
            to_sec = int(timeout_var.get() or 120)
        except ValueError:
            to_sec = 120
        solve_btn.config(state=tk.DISABLED)
        status_var.set(f"Solving in backend (C++ solver), timeout {to_sec} s… When a solution is found, it will be shown in the grid.")
        if loaded_file_path:
            t = threading.Thread(target=worker_use_file, daemon=True)
        else:
            t = threading.Thread(target=worker_use_puzzle, daemon=True)
        t.start()

    load_btn.config(command=do_load)
    clear_btn.config(command=do_clear)
    solve_btn.config(command=do_solve)

    # Init
    build_grid(3)
    refresh_library()
    on_size_change()

    root.mainloop()


if __name__ == "__main__":
    main()
