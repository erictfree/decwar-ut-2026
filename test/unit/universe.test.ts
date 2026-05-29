// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 Eric Freeman and The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * Tests for the universe build. Pinned to SETUP.FOR:256–304 and DECWAR.FOR:2753–2779 (PLACE).
 * Exercises the deterministic RNG core in a real placement workload.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../../src/core/state.ts";
import { buildUniverse } from "../../src/lifecycle/universe.ts";
import { Rng } from "../../src/core/rng.ts";
import { KGALV, KGALH, KNBASE, KNPLNT, KNPLAY, DX, SHIELD_CAP } from "../../src/core/constants.ts";
import type { GameState } from "../../src/core/state.ts";

function classCounts(state: GameState): Map<number, number> {
  const counts = new Map<number, number>();
  for (let v = 1; v <= KGALV; v++) {
    for (let h = 1; h <= KGALH; h++) {
      const code = state.board.disp(v, h);
      if (code !== 0) {
        const cls = state.board.dispc(v, h);
        counts.set(cls, (counts.get(cls) ?? 0) + 1);
      }
    }
  }
  return counts;
}

test("builds the right population: 10 bases/side, 60 planets, 100..350 stars, no black holes by default", () => {
  const state = createInitialGameState(new Rng(12345));
  buildUniverse(state);
  const c = classCounts(state);

  assert.equal(c.get(DX.FBAS), KNBASE); // 10 Federation bases
  assert.equal(c.get(DX.EBAS), KNBASE); // 10 Empire bases
  assert.equal(c.get(DX.NPLN), KNPLNT); // 60 neutral planets
  const stars = c.get(DX.STAR) ?? 0;
  assert.ok(stars >= 100 && stars <= 350, `stars=${stars} out of range`);
  assert.equal(c.get(DX.BHOL) ?? 0, 0); // black holes off by default

  assert.equal(state.nbase[1], KNBASE);
  assert.equal(state.nbase[2], KNBASE);
  assert.equal(state.nplnet, KNPLNT);
  assert.equal(state.bases[1]?.[1]?.strength, SHIELD_CAP); // 1000
  for (let i = 1; i <= KNPLAY; i++) assert.equal(state.alive[i], 1); // all slots available
});

test("no two objects share a cell", () => {
  const state = createInitialGameState(new Rng(777));
  buildUniverse(state);
  const c = classCounts(state);
  let occupied = 0;
  for (const n of c.values()) occupied += n;
  const stars = c.get(DX.STAR) ?? 0;
  assert.equal(occupied, KNBASE * 2 + KNPLNT + stars); // every placement landed on a distinct cell
});

test("the build is deterministic for a fixed seed", () => {
  const a = createInitialGameState(new Rng(42));
  const b = createInitialGameState(new Rng(42));
  buildUniverse(a);
  buildUniverse(b);
  assert.equal((classCounts(a).get(DX.STAR) ?? 0), (classCounts(b).get(DX.STAR) ?? 0));
  assert.deepEqual(a.bases[1]?.[1], b.bases[1]?.[1]); // same first base position
  assert.deepEqual(a.planets[1], b.planets[1]); // same first planet position
});

test("black holes are placed when enabled", () => {
  const state = createInitialGameState(new Rng(2024));
  state.blhopt = true;
  buildUniverse(state);
  const holes = classCounts(state).get(DX.BHOL) ?? 0;
  assert.ok(holes >= 10 && holes <= 50, `holes=${holes} out of range`);
});
