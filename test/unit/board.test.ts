// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 Eric Freeman and The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * Tests for the packed galaxy board. Pinned to DISP/SETDSP/DISPC/DISPX
 * (WARMAC.MAC:5295–5375) and Deliverable #5 §3.4.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Board } from "../../src/core/board.ts";
import { DX, CELL_SENTINEL_RAW } from "../../src/core/constants.ts";

test("setdsp/disp round-trips a class*100+index code", () => {
  const b = new Board();
  const code = DX.ESHP * 100 + 14; // empire ship in slot 14 => 214
  b.setdsp(10, 10, code);
  assert.equal(b.disp(10, 10), 214);
  assert.equal(b.dispc(10, 10), 2); // class = empire ship
  assert.equal(b.dispx(10, 10), 14); // index = player slot
});

test("a black hole decomposes correctly", () => {
  const b = new Board();
  b.setdsp(40, 40, DX.BHOL * 100); // 1000
  assert.equal(b.dispc(40, 40), 10);
  assert.equal(b.dispx(40, 40), 0);
});

test("empty cells read back as 0 (DXMPTY)", () => {
  const b = new Board();
  assert.equal(b.disp(1, 1), 0);
  assert.equal(b.disp(75, 75), 0);
});

test("the 7777-octal sentinel reads back as -1", () => {
  const b = new Board();
  b.setdsp(5, 5, CELL_SENTINEL_RAW); // 4095 = 12 bits of 1
  assert.equal(b.disp(5, 5), -1);

  // Writing -1 deposits the same low-12-bits sentinel (-1 & 0o7777 == 4095).
  b.setdsp(6, 6, -1);
  assert.equal(b.disp(6, 6), -1);
});

test("setdsp keeps only the low 12 bits (dpb)", () => {
  const b = new Board();
  b.setdsp(20, 20, 0o17777); // high bit beyond 12 should be dropped -> 0o7777 -> -1
  assert.equal(b.disp(20, 20), -1);
});

test("ingal() bounds the 75x75 galaxy", () => {
  const b = new Board();
  assert.equal(b.ingal(1, 1), true);
  assert.equal(b.ingal(75, 75), true);
  assert.equal(b.ingal(0, 1), false);
  assert.equal(b.ingal(1, 0), false);
  assert.equal(b.ingal(76, 1), false);
  assert.equal(b.ingal(1, 76), false);
});

test("out-of-galaxy access throws", () => {
  const b = new Board();
  assert.throws(() => b.disp(0, 0), RangeError);
  assert.throws(() => b.setdsp(76, 1, 0), RangeError);
});

test("clear() resets every cell to empty", () => {
  const b = new Board();
  b.setdsp(30, 30, DX.STAR * 100);
  assert.equal(b.disp(30, 30), 900);
  b.clear();
  assert.equal(b.disp(30, 30), 0);
});
