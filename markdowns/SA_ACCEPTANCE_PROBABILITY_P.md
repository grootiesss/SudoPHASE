# How the Acceptance Probability P Is Used in Simulated Annealing

This document briefly discusses how the Metropolis acceptance probability **P** is used in the SA implementation for Sudoku refinement.

---

## Definition (Equation 8)

From the paper:

- **Improving or neutral moves** (ΔC ≤ 0): **P = 1** — always accept.
- **Worsening moves** (ΔC > 0): **P = exp(−ΔC / T)** — accept with this probability.

Where:
- **ΔC** = cost change (new cost − current cost)
- **T** = current temperature

---

## Implementation

In `simulatedannealing.cpp`, improving moves bypass the random check; only worsening moves use P:

```cpp
if (delta <= 0) {
    // P = 1: always accept
    currentCost = newCost;
    // ... update best if better
} else {
    acceptanceProbability = exp(-delta / temp);   // P = exp(-ΔC/T)
    double rnd = (double) rand() / RAND_MAX;      // uniform random in [0, 1]
    if (rnd < acceptanceProbability) {
        currentCost = newCost;                    // accept
    } else {
        sol.Copy(currentSol);                     // reject: revert
    }
}
```

---

## Use of P: The Random Check

To accept a worsening move with probability P, we draw a **uniform random number** `rnd` in [0, 1]. A value in this range is equally likely to be drawn, so:

- **Prob(rnd < P) = P**

Therefore:
- If `rnd < P` → accept the move.
- If `rnd ≥ P` → reject and revert.

This yields the desired stochastic acceptance: worsening moves are accepted with probability P.

---

## Role of Temperature

- **High T**: P = exp(−ΔC/T) ≈ 1 → many worsening moves accepted (exploration).
- **Low T**: P ≈ 0 → worsening moves rarely accepted (exploitation).

So P controls how much the search is allowed to escape local minima early on, and becomes more greedy as T decreases.
