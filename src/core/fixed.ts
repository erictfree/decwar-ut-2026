// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 Eric Freeman and The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * ×10 fixed-point arithmetic — the single most important fidelity rule in the port.
 *
 * Source: `WARMAC.MAC:2305–2337` (OFLT/OSFLT); analysis Deliverable #6 §0.1/§15, #5 §2.
 * Classification: Preserve exactly (REQ-FIXED-001).
 *
 * DECWAR stores energy, damage, shield charge, device damage, base & Romulan strength, and
 * all scoring as **integers scaled by 10** ("tenths"). A stored 48750 means 4875.0. The
 * ONLY place a division by 10 happens is the output formatter (OFLT), which splits the
 * stored integer into an integer part (`idivi …,^D10` quotient) and a single fractional
 * digit (the remainder), and OMITS the fraction in short output.
 *
 * INVARIANTS (enforced by review; a future lint rule will check the handler layer):
 *   • Never use `Math.round` on a ×10 value — FORTRAN integer assignment truncates toward
 *     zero. Use `truncToTenths` on every store-back from real-valued combat math.
 *   • Never store a ×10 quantity as a non-integer ("1234.5"); store 12345.
 *   • Divide by 10 ONLY in the renderer (`renderTenths`/`renderSignedTenths`).
 */

/** A ×10 scaled integer (tenths). The canonical store representation for the OFLT family. */
export type Tenths = number;

/**
 * Integer part of a ×10 value — the OFLT `idivi x1,^D10` quotient. Truncates toward zero,
 * matching PDP-10 `idivi` (e.g. whole(48750)=4875, whole(-5)=0).
 */
export function whole(t: Tenths): number {
  return Math.trunc(t / 10);
}

/**
 * Single fractional digit of a ×10 value — the OFLT remainder, taken as an absolute digit
 * (0..9). e.g. frac(48750)=0, frac(20005)=5, frac(-5)=5.
 */
export function frac(t: Tenths): number {
  return Math.abs(t % 10);
}

/**
 * Store-back truncation: convert a real (e.g. a floating-point combat result) into the ×10
 * integer store, truncating toward zero — exactly what FORTRAN integer assignment does
 * (`shpcon(j,KSDAM) = shpcon(j,KSDAM) + hita`, DECWAR.FOR:4148). Never rounds.
 */
export function truncToTenths(real: number): Tenths {
  return Math.trunc(real);
}

/** Options for rendering a ×10 value to its displayed string. */
export interface RenderOpts {
  /** Short output (`OFLG=SHORT`) omits the decimal point and fractional digit. */
  short?: boolean;
}

/**
 * Render a ×10 value the way OFLT does: `<whole>.<frac>`, or just `<whole>` in short mode.
 * The integer part carries its own sign (so a negative magnitude < 1.0 prints its fraction
 * without a sign — an OFLT quirk; the OFLT-rendered fields are non-negative in practice).
 *
 * Examples: renderTenths(48750) => "4875.0"; renderTenths(48750,{short:true}) => "4875";
 *           renderTenths(20005) => "2000.5".
 */
export function renderTenths(t: Tenths, opts: RenderOpts = {}): string {
  const w = whole(t);
  if (opts.short ?? false) return `${w}`;
  return `${w}.${frac(t)}`;
}

/**
 * Render a ×10 value the way OSFLT does: always prefix an explicit sign (`+`/`-`), then the
 * magnitude with one fractional digit (or none in short mode). OSFLT treats values > 0 as
 * positive and ≤ 0 as negative (`skipg`); used for the signed shield product
 * `KSHCON*KSSHPC` where the sign carries shields-up/down (STATUS:3888, OUTHIT:2420/2485).
 *
 * Examples: renderSignedTenths(1000) => "+100.0"; renderSignedTenths(-1000) => "-100.0".
 */
export function renderSignedTenths(t: Tenths, opts: RenderOpts = {}): string {
  const sign = t > 0 ? "+" : "-";
  const mag = Math.abs(t);
  if (opts.short ?? false) return `${sign}${whole(mag)}`;
  return `${sign}${whole(mag)}.${frac(mag)}`;
}
