// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 Eric Freeman and The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * Tests for SCAN/SRSCAN (grid render) and DAMAGES. Pinned to DECWAR.FOR:3512–3603, 780–828,
 * and the WARMAC objtbl/ODEV symbol tables.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState, newlyActivatedShip } from "../../src/core/state.ts";
import { createSession } from "../../src/core/session.ts";
import { scan } from "../../src/commands/scan.ts";
import { damages } from "../../src/commands/damages.ts";
import { tokenize } from "../../src/parser/tokenizer.ts";
import { Rng } from "../../src/core/rng.ts";
import { DEV, KCRIT } from "../../src/core/constants.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";
import type { GameState } from "../../src/core/state.ts";
import type { Session } from "../../src/core/session.ts";

function setup(): { state: GameState; session: Session; io: ScriptedIo } {
  const state = createInitialGameState(new Rng(1));
  const io = new ScriptedIo([]);
  const session = createSession(io);
  session.who = 1;
  session.team = 1;
  session.player = true;
  const p = newlyActivatedShip();
  p.vPos = 38;
  p.hPos = 38;
  state.ships[1] = p;
  state.alive[1] = -1;
  state.board.setdsp(38, 38, 101); // Excalibur
  return { state, session, io };
}

test("SCAN renders a grid with the objtbl symbols around the ship", () => {
  const { state, session, io } = setup();
  state.board.setdsp(40, 40, 9 * 100); // star
  state.board.setdsp(41, 35, 3 * 100 + 1); // Federation base
  state.board.setdsp(35, 38, 10 * 100); // black hole
  session.tokens = tokenize("SCAN 3", 0).tokens;
  scan(state, session, false);
  const out = io.output;
  assert.match(out, / E /); // the player's scan tag (Excalibur = E)
  assert.match(out, / \* /); // a star
  assert.match(out, /<>/); // a Federation base
  assert.match(out, /^\s+35\s+37\s+39\s+41/m); // column header (range 3 around H=38)
  assert.match(out, /^38 /m); // a row labelled with the ship's V
});

test("SRSCAN uses a smaller default range", () => {
  const { state, session, io } = setup();
  session.tokens = tokenize("SRSCAN", 0).tokens;
  scan(state, session, true);
  // SRSCAN default range 7 → rows 31..45 (clamped to galaxy); fewer than SCAN's range-10 span.
  const rows = io.output.split("\r\n").filter((l) => /^\d/.test(l)).length;
  assert.ok(rows <= 15, `SRSCAN should span ≤ 15 rows, got ${rows}`);
});

test("DAMAGES reports all-functional when nothing is damaged", () => {
  const { state, session, io } = setup();
  session.tokens = tokenize("DAMAGES", 0).tokens;
  damages(state, session);
  assert.match(io.output, /All devices functional\./);
});

test("DAMAGES lists a damaged device with its ×10 damage", () => {
  const { state, session, io } = setup();
  state.devices[1]![DEV.KDPHAS] = 1500; // 150.0 damage to phasers
  session.tokens = tokenize("DAMAGES", 0).tokens;
  damages(state, session);
  assert.match(io.output, /Phasers/);
  assert.match(io.output, /150\.0/);
});

test("DAMAGES with a device argument reports just that device", () => {
  const { state, session, io } = setup();
  state.devices[1]![DEV.KDWARP] = KCRIT; // warp critical
  session.tokens = tokenize("DAMAGES WA", 0).tokens;
  damages(state, session);
  assert.match(io.output, /Warp/);
  assert.doesNotMatch(io.output, /All devices/);
});
