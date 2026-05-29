// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * `EQUAL` — the case-insensitive prefix/keyword matcher.
 *
 * Source: `WARMAC.MAC:4320–4372`; analysis Deliverable #4 §1.2. Classification: Preserve
 * exactly (REQ-CMD-002).
 *
 * Compares a typed token (`sub`) against a master keyword, both upcased, at most 5 characters
 * (the SIXBIT token width). Returns:
 *   • -2  exact match  (sub equals master, or master also ends where sub ends)
 *   • -1  prefix match (sub is a strict prefix of master — master has more, non-space chars)
 *   •  0  no match     (a character differs, sub is longer than master, or sub is empty/space)
 *
 * The −2/−1/0 trichotomy is decoded from the MACRO-10 skip logic: after the sub string ends,
 * the routine reads the next master char and `cain c,040` (skip-if-NOT-space) means a master
 * that still has a non-space char yields −1 (prefix), while a master that ends (null/space)
 * yields −2 (exact). Callers (GETCMD/XGTCMD) treat any nonzero as "matched".
 */
const LIMIT = 5;

export function equal(sub: string, master: string): -2 | -1 | 0 {
  const s = (sub ?? "").toUpperCase();
  const m = (master ?? "").toUpperCase();

  // a null/space-leading substring never matches (the `equa.4` guard)
  if (s.length === 0 || s[0] === " " || s[0] === "\0") return 0;

  for (let i = 0; i < LIMIT; i++) {
    const sc = i < s.length ? (s[i] as string) : "\0";
    if (sc === "\0" || sc === " ") {
      // sub ended within 5 chars: exact iff master also ended here, else prefix
      const mc = i < m.length ? (m[i] as string) : "\0";
      return mc === "\0" || mc === " " ? -2 : -1;
    }
    const mc = i < m.length ? (m[i] as string) : "\0";
    if (sc !== mc) return 0; // mismatch (covers sub longer than master)
  }
  return -2; // all 5 characters matched
}
