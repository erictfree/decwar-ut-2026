/**
 * CHECK + CHKPNT — trajectory path-stepping for movement (and, later, torpedoes).
 *
 * Source: `DECWAR.FOR:696–769`; analysis Deliverable #6 §2. Classification: Preserve exactly
 * (the `ran()` cell tie-break consumes the RNG and is load-bearing).
 *
 * Walk a straight path from (v0,h0) by delta (dv,dh) for `dist` cells, stepping the dominant
 * axis one cell at a time while the cross axis accumulates `slope = crossDelta/|dominantDelta|
 * + displ`. At each step CHKPNT rounds the cross coordinate: if the fraction is within ±0.10
 * of a half-cell it returns BOTH neighboring cells (a near-tie) and the final cell is chosen
 * by `int(accum + ran())` — a literal coin flip; otherwise it rounds half-up with no RNG. The
 * walk stops at the first occupied cell (`disp > 0`), reporting that object's code in `dcode`
 * and leaving the ship at the last clear cell; or at the galaxy edge.
 *
 * NOTE: the original swaps V/H names between MOVE's call and CHECK's parameters; this clean
 * implementation works directly in (vertical, horizontal) = (v, h) and is verified by tests.
 */
import type { Board } from "../core/board.ts";
import type { Rng } from "../core/rng.ts";
import { KGALV } from "../core/constants.ts";

export interface CheckResult {
  /** Final cell reached (vertical, horizontal) — the last clear cell on the path. */
  v1: number;
  h1: number;
  /** Obstacle cell (vertical, horizontal) — where the blocking object sits (= final cell if clear). */
  v2: number;
  h2: number;
  /** DISP code of the obstacle that stopped the path, or 0 if the path was clear. */
  dcode: number;
}

const inRange = (c: number): boolean => c >= 1 && c <= KGALV; // galaxy is square, 1..75

/** CHKPNT: returns [c1, c2]; c2 === 0 means a single (rounded) cell, else a near-tie pair. */
function chkpnt(c: number): [number, number] {
  if (Math.abs((Math.trunc(c * 100) % 100) - 50) < 10) {
    return [Math.trunc(c), Math.trunc(c) + 1]; // within 0.40..0.60 → two candidate cells
  }
  return [Math.trunc(c + 0.5), 0]; // round half-up, single cell
}

export function check(
  board: Board,
  rng: Rng,
  v0: number,
  h0: number,
  dv: number,
  dh: number,
  dist: number,
  displ: number,
): CheckResult {
  let v1 = v0;
  let h1 = h0;
  let v2c = v0;
  let h2c = h0;
  let dcode = 0;

  const verticalDominant = Math.abs(dh) <= Math.abs(dv); // |dv| >= |dh| → step vertically

  if (verticalDominant) {
    const inc = dv >= 0 ? 1 : -1; // isign(1, dv)
    const slope = dh / Math.abs(dv) + displ; // horizontal slope per vertical step
    let v2 = v0;
    let rH = h0;
    for (let i = 0; i < dist; i++) {
      v2 += inc;
      if (!inRange(v2)) break; // off the galaxy edge → stop at last clear cell
      rH += slope;
      const [c1, c2] = chkpnt(rH);
      if (!inRange(c1)) break;
      if (board.disp(v2, c1) > 0) {
        dcode = board.disp(v2, c1);
        v2c = v2;
        h2c = c1;
        break;
      }
      let newH: number;
      if (c2 !== 0) {
        if (!inRange(c2)) break;
        if (board.disp(v2, c2) > 0) {
          dcode = board.disp(v2, c2);
          v2c = v2;
          h2c = c2;
          break;
        }
        newH = Math.trunc(rH + rng.ran()); // RNG tie-break
      } else {
        newH = Math.trunc(rH + 0.5);
      }
      v1 = v2;
      h1 = newH;
    }
  } else {
    const inc = dh >= 0 ? 1 : -1; // isign(1, dh)
    const slope = dv / Math.abs(dh) + displ; // vertical slope per horizontal step
    let h2 = h0;
    let rV = v0;
    for (let i = 0; i < dist; i++) {
      h2 += inc;
      if (!inRange(h2)) break;
      rV += slope;
      const [c1, c2] = chkpnt(rV);
      if (!inRange(c1)) break;
      if (board.disp(c1, h2) > 0) {
        dcode = board.disp(c1, h2);
        v2c = c1;
        h2c = h2;
        break;
      }
      let newV: number;
      if (c2 !== 0) {
        if (!inRange(c2)) break;
        if (board.disp(c2, h2) > 0) {
          dcode = board.disp(c2, h2);
          v2c = c2;
          h2c = h2;
          break;
        }
        newV = Math.trunc(rV + rng.ran()); // RNG tie-break
      } else {
        newV = Math.trunc(rV + 0.5);
      }
      h1 = h2;
      v1 = newV;
    }
  }

  if (dcode === 0) {
    v2c = v1;
    h2c = h1;
  }
  return { v1, h1, v2: v2c, h2: h2c, dcode };
}
