// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * PWR — floating-point base raised to an integer power (phaser distance falloff).
 *
 * Source: `WARMAC.MAC:2728–2766`; analysis Deliverable #6 §9. Classification: Preserve-as-real
 * (the squaring structure accumulates rounding differently than `Math.pow`, so reproduce it
 * exactly — do NOT substitute `Math.pow`). Part of the OQ-1 single-vs-double precision concern;
 * computed in JS double (the default CombatMath policy).
 *
 * For n < 5 the factors are multiplied out directly; for n ≥ 5 it is exponentiation by
 * squaring: pwr(f,n) = pwr(f, ⌊n/2⌋)² × (f if n is odd).
 */
export function pwr(f: number, n: number): number {
  if (n < 5) {
    let r = 1.0;
    if (n >= 1) r = f;
    if (n >= 2) r *= f;
    if (n >= 3) r *= f;
    if (n >= 4) r *= f;
    return r;
  }
  const half = pwr(f, Math.trunc(n / 2));
  let r = half * half;
  if (n % 2 !== 0) r *= f; // odd power → one more factor
  return r;
}
