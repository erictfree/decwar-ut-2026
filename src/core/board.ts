// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 Eric Freeman and The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * The galaxy board — a 75×75 grid of objects.
 *
 * Source (verified during planning): `WARMAC.MAC:5295–5375` (DISP/SETDSP/DISPC/DISPX),
 * `WARMAC.MAC:924–927` (`b12tbl` 12-bit byte pointer), `WARMAC.MAC:359–371` (class codes);
 * analysis Deliverable #5 §3.4. Classification: Preserve semantically (REQ-FIXED-002).
 *
 * Each cell holds an object DISP code = `class*100 + index`:
 *   • class    = code / 100  (DISPC; DX.* in constants.ts: 0 empty … 10 black hole)
 *   • index    = code % 100  (DISPX; for ships this is the player slot 1..18)
 * Empty space is 0. A cell of `7777`(octal) = 4095 (all 12 bits set) reads back as **−1**
 * (the `cain t0,7777 / seto t0` sentinel in DISP).
 *
 * The original packs 3 cells per 36-bit word (12 bits each). That packing is technology-
 * forced storage only; this port uses a flat array of 12-bit-valued cells (Deliverable
 * #13 §2.8). The OBSERVABLE properties preserved are: the 12-bit value width, the
 * `class*100+index` encoding, and the `7777 → −1` read sentinel.
 *
 * Coordinates are **1-based** (1..75), matching the FORTRAN. The ODISP renderer's defensive
 * "cloaked" (code<0) and class>10 clamps are display concerns and live in the renderer (a
 * later increment), not in these raw board accessors.
 */
import { KGALV, KGALH, CELL_SENTINEL, CELL_SENTINEL_RAW } from "./constants.ts";

const CELL_MASK = 0o7777; // 12 bits

export class Board {
  readonly #cells: Int16Array;

  constructor() {
    this.#cells = new Int16Array(KGALV * KGALH); // zero-filled = all empty (DXMPTY)
  }

  /** Reset every cell to empty (the first-player `/hiseg/` zeroing of `board`). */
  clear(): void {
    this.#cells.fill(0);
  }

  /** True iff (v,h) is inside the galaxy: 1 ≤ v ≤ 75 and 1 ≤ h ≤ 75. (INGAL) */
  ingal(v: number, h: number): boolean {
    return v >= 1 && v <= KGALV && h >= 1 && h <= KGALH;
  }

  #index(v: number, h: number): number {
    if (!this.ingal(v, h)) {
      throw new RangeError(`board coordinate out of galaxy: (v=${v}, h=${h})`);
    }
    return (v - 1) * KGALH + (h - 1);
  }

  /**
   * DISP(v,h): the object code at (v,h). Empty = 0; a stored `7777`(octal) reads back as −1.
   */
  disp(v: number, h: number): number {
    const raw = this.#cells[this.#index(v, h)] as number;
    return raw === CELL_SENTINEL_RAW ? CELL_SENTINEL : raw;
  }

  /**
   * SETDSP(v,h,code): deposit a 12-bit object code (only the low 12 bits are kept, exactly
   * as the original `dpb`). Writing `7777`(octal) / −1 deposits the sentinel, which DISP
   * then reads back as −1.
   */
  setdsp(v: number, h: number, code: number): void {
    this.#cells[this.#index(v, h)] = code & CELL_MASK;
  }

  /** DISPC(v,h): object class = DISP(v,h) / 100 (integer, toward zero). */
  dispc(v: number, h: number): number {
    return Math.trunc(this.disp(v, h) / 100);
  }

  /** DISPX(v,h): object index = DISP(v,h) mod 100 (sign follows DISP, matching the FORTRAN). */
  dispx(v: number, h: number): number {
    return this.disp(v, h) % 100;
  }
}
