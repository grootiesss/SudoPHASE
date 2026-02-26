# Deploying the MT-ACS-RING Solver and Using Your Processors

The solver uses **multiple threads** (via C++11 `std::thread`) when you run **algorithm 2** (parallel ACS). Each **sub-colony** runs in its own thread, so you control CPU usage mainly with `--subcolonies`. This guide covers deployment options so you can fully use your computer’s processors.

---

## 1. Build for deployment (performance)

- **Windows (Visual Studio)**  
  - Build **Release | x64** so the binary uses optimizations and 64-bit addressing.  
  - Output: `vs2017\x64\Release\sudoku_ants.exe`.  
  - Optional: In the project properties, set **C/C++ → General → Multi-Processor Compilation** to **Yes** for faster builds.

- **Linux / WSL / MinGW**  
  From the repo root:
  ```bash
  mkdir -p obj
  make -f markdowns/Makefile
  ```
  Produces `sudokusolver` (linked with `-pthread`). Use this binary for all deployment options below; on Windows with the script you can point to `sudoku_ants.exe` instead (see README).

---

## 2. Using your processors: one solver process

- **Algorithm 2 (parallel ACS)** is the one that uses multiple cores.  
- Set **`--subcolonies N`** to the number of **worker threads** (sub-colonies). A practical choice is your **number of logical CPUs** (or slightly less to leave headroom).

  **Examples:**

  - 8 logical cores, use 8 sub-colonies:
    ```bash
    ./sudokusolver --file instances/general/example.txt --alg 2 --subcolonies 8 --timeout 120 --verbose
    ```
  - Same via the batch script:
    ```bash
    python scripts/run_general.py --solver ./sudokusolver --alg 2 --subcolonies 8 --timeout 60 --output results/alg2_8colonies.csv --verbose
    ```

- **Algorithm 0** (single-colony ACS) is effectively single-threaded (plus any minor OS/STL threading). Use **algorithm 2** if you want to exploit multiple processors.

---

## 3. Deployment options (by scenario)

### A. Local deployment (this machine only)

- **Single runs:** Run the executable from the command line (or a shortcut/script) with `--alg 2` and `--subcolonies` set as above. No extra deployment step.
- **Batch runs:** Use `scripts/run_general.py` to run many instances; each instance runs one solver process. With `--alg 2 --subcolonies N`, that process uses N threads. The script runs instances **one after another** by default, so at any time one process is using your CPUs.
- **Tip:** Run the script from the **repository root** so `--solver ./sudokusolver` (or `.\sudoku_ants.exe`) and instance paths like `instances/...` resolve correctly.

### B. Using more processors: multiple solver processes in parallel

If you have many instances and want to use more of your machine at once, run **several solver processes in parallel**, each on a different subset of instances (or different instance lists):

- **Option 1 – Manual split:** Split your instance list into 2–4 (or more) parts. In 2–4 terminal windows (or background jobs), run:
  ```bash
  python scripts/run_general.py --solver ./sudokusolver --alg 2 --subcolonies 4 --instances-root instances/9x9-database --range-start 9x9_00001 --range-end 9x9_00050 --output results/batch1.csv
  python scripts/run_general.py --solver ./sudokusolver --alg 2 --subcolonies 4 --instances-root instances/9x9-database --range-start 9x9_00051 --range-end 9x9_00100 --output results/batch2.csv
  ```
  Then merge the CSVs if needed. Each process uses 4 threads; the OS will schedule them across cores (you can run as many parallel processes as cores allow).

- **Option 2 – GNU Parallel / PowerShell jobs:** Use a parallel runner to start one solver (or one `run_general.py` run) per batch of instances. Limit the number of parallel jobs so that `(number of jobs) × (--subcolonies)` is roughly at or below your logical CPU count to avoid oversubscription.

### C. Same binary on another Windows/Linux machine

- Copy the built executable (`sudoku_ants.exe` or `sudokusolver`) and, if you use the script, the repo (or at least `scripts/`, `instances/`, and the solver binary).
- On the other machine, run the same commands; set `--subcolonies` to that machine’s logical CPU count (or slightly less).
- No special runtime is needed beyond the usual C++ runtime (Visual C++ Redistributable on Windows if you built with MSVC).

### D. High-performance cluster (HPC) or Slurm/PBS

- Build the solver on the cluster (or build locally for the same OS/arch and copy the binary).
- Submit one job per instance (or per batch of instances). In the job script, set:
  - `#SBATCH --cpus-per-task=N` (or equivalent) to N.
  - Run the solver with `--alg 2 --subcolonies N` so it matches the allocated cores.
- Run the solver (and optionally `run_general.py`) inside the job script; paths must point to the binary and instance files on the cluster.

### E. Docker (reproducible environment)

- **Dockerfile** (example for a Linux build inside the container):

  ```dockerfile
  FROM gcc:latest
  WORKDIR /app
  COPY . .
  RUN mkdir -p obj && make -f markdowns/Makefile
  ENTRYPOINT ["./sudokusolver"]
  ```

  Then run with the same arguments; e.g.:
  ```bash
  docker run --rm -v "%cd%\instances:/app/instances" <image> --file /app/instances/general/example.txt --alg 2 --subcolonies 8 --timeout 120
  ```
  The process will use up to 8 threads inside the container; the host’s CPU count still limits real parallelism. Use `--cpus=N` in `docker run` if you want to cap CPU usage.

- Useful for reproducible runs and portability; the binary still uses the host’s processors when the container runs.

### F. Cloud VM (e.g. Azure, AWS, GCP)

- Provision a VM with the desired number of vCPUs.
- Install build tools (or copy a pre-built binary), copy the repo (or solver + instances + script).
- Build or run the solver with `--alg 2 --subcolonies N` where N matches the vCPU count (or slightly less). Same command line as local deployment.

---

## 4. Quick reference: key flags for multi-core use

| Goal                         | What to do |
|-----------------------------|------------|
| Use multiple cores          | `--alg 2` (parallel ACS) |
| Set number of threads       | `--subcolonies N` (e.g. N = logical CPU count) |
| Batch runs with many cores  | `python scripts/run_general.py --solver <path> --alg 2 --subcolonies N ...` |
| Run many instances in parallel | Run multiple `run_general.py` or solver processes with different instance ranges/outputs |

---

## 5. Summary

- **Deploy** by building the Release (or Makefile) binary and running it from the command line or via `run_general.py`.
- **Use your processors** by running with **`--alg 2`** and **`--subcolonies`** equal to (or slightly less than) your logical CPU count.
- For **more throughput**, run **multiple solver processes** in parallel (e.g. different instance batches), each with a sensible `--subcolonies` value.
- The same binary can be deployed **locally**, on **another PC**, on an **HPC cluster**, in **Docker**, or on a **cloud VM**; in each case, set `--subcolonies` to the number of cores you want that process to use.
