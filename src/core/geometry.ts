// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 Eric Freeman and The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * Galaxy distance helpers.
 *
 * Source: `WARMAC.MAC:4373–4421` (LDIS/PDIST); analysis Deliverable #6 §1. Classification:
 * Preserve exactly. DECWAR uses **Chebyshev** (king-move) distance, NOT Euclidean: a diagonal
 * step costs the same as a straight step.
 */

/** PDIST: Chebyshev distance — the larger of the vertical and horizontal sector gaps. */
export function pdist(v1: number, h1: number, v2: number, h2: number): number {
  return Math.max(Math.abs(v1 - v2), Math.abs(h1 - h2));
}

/** LDIS: true iff (v2,h2) is within an n×n square neighborhood of (v1,h1) (Chebyshev ≤ n). */
export function ldis(
  v1: number,
  h1: number,
  v2: number,
  h2: number,
  n: number,
): boolean {
  return Math.abs(v1 - v2) <= n && Math.abs(h1 - h2) <= n;
}
