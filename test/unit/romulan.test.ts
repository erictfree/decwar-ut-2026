// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 Eric Freeman and The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * Tests for the Romulan NPC. Pinned to DECWAR.FOR ROMDRV/DIST/PHAROM/TOROM/DEADRO
 * (3220–3384, 831–883); Deliverable #11. RNG seeded (small seeds → tiny first draws).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState, newlyActivatedShip } from "../../src/core/state.ts";
import { romdrv, pharom, torom, deadro } from "../../src/combat/romulan.ts";
import { Rng } from "../../src/core/rng.ts";
import { DX, PT } from "../../src/core/constants.ts";
import type { GameState } from "../../src/core/state.ts";

/** One Fed player at (10,10), shields down, on the board. */
function withPlayer(seed: number): GameState {
  const s = createInitialGameState(new Rng(seed));
  s.numply = 1;
  const p = newlyActivatedShip();
  p.vPos = 10;
  p.hPos = 10;
  p.shieldCond = -1;
  p.shieldPct = 0;
  s.ships[1] = p;
  s.alive[1] = -1;
  s.board.setdsp(10, 10, 101);
  return s;
}

test("the self-gate skips the Romulan when romcnt*2 < numply", () => {
  const s = withPlayer(1);
  s.numply = 4;
  s.romulan.moveCounter = 0;
  romdrv(s);
  assert.equal(s.romulan.moveCounter, 1); // incremented
  assert.equal(s.romulan.exists, false); // but no action
});

test("the Romulan does not spawn until romcnt ≥ numply*3", () => {
  const s = withPlayer(1);
  s.romulan.moveCounter = 1; // → 2 after increment, < 3
  romdrv(s);
  assert.equal(s.romulan.exists, false);
});

test("the Romulan spawns with energy 201–400 and is detected", () => {
  const s = withPlayer(1); // iran(5)=4 (≠5) on the first draw → spawn
  s.romulan.moveCounter = 100;
  romdrv(s);
  assert.equal(s.romulan.exists, true);
  assert.ok(s.romulan.energy >= 201 && s.romulan.energy <= 400, `erom=${s.romulan.energy}`);
  assert.equal(s.romulan.numSpawned, 1);
  assert.equal(s.board.dispc(s.romulan.vPos, s.romulan.hPos), DX.ROM); // on the board
});

test("DIST picks the nearest visible target of either side", () => {
  const s = withPlayer(1);
  s.romulan.exists = true;
  s.romulan.energy = 300;
  s.romulan.vPos = 10;
  s.romulan.hPos = 11; // adjacent to the player (range 1)
  s.board.setdsp(10, 11, 501);
  s.romulan.moveCounter = 100;
  romdrv(s); // point-blank → attacks in place
  assert.ok(s.ships[1]!.damage > 0, "the Romulan should hit the adjacent player");
  assert.equal(s.ships[1]!.condition, 3); // RED
  assert.ok(s.bus.hasHits(1)); // player receives the hit
  assert.ok(s.romulan.score[PT.KPEDAM]! > 0); // Romulan scoreboard (rsr) credited
});

test("PHAROM drains the Romulan's energy and DEADRO kills it", () => {
  const s = withPlayer(1);
  s.romulan.exists = true;
  s.romulan.vPos = 20;
  s.romulan.hPos = 20;
  s.board.setdsp(20, 20, 501);

  s.romulan.energy = 1000;
  const hit = pharom(s, 200, 1); // ihita = (100+iran(100))*200/10
  assert.ok(hit.ihita > 0);
  assert.ok(s.romulan.energy < 1000); // drained
  assert.equal(hit.klflg, 0); // survived

  s.romulan.energy = 10;
  const kill = pharom(s, 200, 1);
  assert.equal(kill.klflg, 2);
  assert.equal(s.romulan.exists, false); // DEADRO
  assert.equal(s.board.disp(20, 20), 0); // cell cleared
});

test("TOROM drains energy (min(iran(4000),2000)) and can kill", () => {
  const s = withPlayer(1);
  s.romulan.exists = true;
  s.romulan.vPos = 20;
  s.romulan.hPos = 20;
  s.board.setdsp(20, 20, 501);
  s.romulan.energy = 5;
  const r = torom(s);
  assert.ok(r.ihita > 0 && r.ihita <= 2000);
  assert.equal(r.klflg, 2);
  assert.equal(s.romulan.exists, false);
});

test("DEADRO clears the Romulan", () => {
  const s = withPlayer(1);
  s.romulan.exists = true;
  s.romulan.vPos = 30;
  s.romulan.hPos = 30;
  s.board.setdsp(30, 30, 501);
  deadro(s);
  assert.equal(s.romulan.exists, false);
  assert.equal(s.board.disp(30, 30), 0);
});
