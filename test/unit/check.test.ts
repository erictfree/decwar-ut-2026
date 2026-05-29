// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * Tests for CHECK/CHKPNT path-stepping. Pinned to DECWAR.FOR:696–769 (endpoints cross-checked
 * by hand). RNG is seeded; straight/45° paths consume no RNG (no near-ties).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Board } from "../../src/core/board.ts";
import { Rng } from "../../src/core/rng.ts";
import { check } from "../../src/movement/check.ts";
import { DX } from "../../src/core/constants.ts";

const rng = () => new Rng(1);

test("straight horizontal move reaches the destination", () => {
  assert.deepEqual(check(new Board(), rng(), 10, 10, 0, 5, 5, 0), {
    v1: 10,
    h1: 15,
    v2: 10,
    h2: 15,
    dcode: 0,
  });
});

test("straight vertical move reaches the destination", () => {
  assert.deepEqual(check(new Board(), rng(), 10, 10, 5, 0, 5, 0), {
    v1: 15,
    h1: 10,
    v2: 15,
    h2: 10,
    dcode: 0,
  });
});

test("45-degree diagonal tracks both axes", () => {
  assert.deepEqual(check(new Board(), rng(), 10, 10, 3, 3, 3, 0), {
    v1: 13,
    h1: 13,
    v2: 13,
    h2: 13,
    dcode: 0,
  });
});

test("a warp-3 (2,3) move lands where CHKPNT rounds it", () => {
  assert.deepEqual(check(new Board(), rng(), 10, 10, 2, 3, 3, 0), {
    v1: 12,
    h1: 13,
    v2: 12,
    h2: 13,
    dcode: 0,
  });
});

test("the path stops at the last clear cell before an obstacle", () => {
  const b = new Board();
  b.setdsp(10, 13, DX.STAR * 100); // a star at (10,13)
  assert.deepEqual(check(b, rng(), 10, 10, 0, 5, 5, 0), {
    v1: 10,
    h1: 12, // stops just short
    v2: 10,
    h2: 13, // the obstacle cell
    dcode: 900, // reports the star
  });
});

test("the path stops at the galaxy edge", () => {
  assert.deepEqual(check(new Board(), rng(), 10, 73, 0, 5, 5, 0), {
    v1: 10,
    h1: 75,
    v2: 10,
    h2: 75,
    dcode: 0,
  });
});
