// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * Tests for MOVE/IMPULSE and the in-game loop's time-consuming path. Pinned to
 * DECWAR.FOR:2134–2244. Uses a controlled empty board so endpoints/energy are deterministic.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState, newlyActivatedShip } from "../../src/core/state.ts";
import { createSession } from "../../src/core/session.ts";
import { move } from "../../src/commands/move.ts";
import { runSession } from "../../src/runtime/loop.ts";
import { tokenize } from "../../src/parser/tokenizer.ts";
import { Rng } from "../../src/core/rng.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";
import type { GameState } from "../../src/core/state.ts";
import type { Session } from "../../src/core/session.ts";

/** Put a single Fed ship at (10,10) on an otherwise-empty board (no universe). */
function shipAt10(
  opts: { seed?: number; energy?: number; lines?: string[] } = {},
): { state: GameState; session: Session; io: ScriptedIo } {
  const state = createInitialGameState(new Rng(opts.seed ?? 1));
  const io = new ScriptedIo(opts.lines ?? []);
  const session = createSession(io);
  session.who = 1;
  session.team = 1;
  session.player = true;
  const ship = newlyActivatedShip();
  ship.vPos = 10;
  ship.hPos = 10;
  if (opts.energy !== undefined) ship.energy = opts.energy;
  state.ships[1] = ship;
  state.board.setdsp(10, 10, 101); // Fed ship #1
  state.alive[1] = -1;
  state.numply = 1;
  state.numsid[1] = 1;
  return { state, session, io };
}

async function runMove(
  cmd: string,
  opts: { seed?: number; energy?: number; impulse?: boolean; prompt?: string[] } = {},
) {
  const setup = shipAt10({
    seed: opts.seed ?? 1,
    lines: opts.prompt ?? [],
    ...(opts.energy !== undefined ? { energy: opts.energy } : {}),
  });
  setup.session.tokens = tokenize(cmd, 0).tokens;
  const tc = await move(setup.state, setup.session, opts.impulse ?? false);
  return { state: setup.state, session: setup.session, io: setup.io, tc, ship: setup.state.ships[1]! };
}

test("warp 3 to (12,13): ship moves, energy = 50000 - 720 (shields up)", async () => {
  const { tc, ship, state } = await runMove("MOVE 12 13");
  assert.equal(tc, true);
  assert.equal(ship.vPos, 12);
  assert.equal(ship.hPos, 13);
  assert.equal(ship.energy, 49280); // 40*3*3=360, ×2 shields up
  assert.equal(state.board.disp(10, 10), 0); // old cell cleared
  assert.equal(state.board.dispx(12, 13), 1); // ship #1 at the new cell
});

test("warp > 6 is rejected and the ship does not move", async () => {
  const { tc, ship, io } = await runMove("MOVE 25 25"); // ia=15
  assert.equal(tc, false);
  assert.equal(ship.vPos, 10);
  assert.equal(ship.hPos, 10);
  assert.match(io.output, /Maximum warp 6\./);
});

test("impulse moves exactly 1 sector; 2 is refused", async () => {
  const ok = await runMove("IMPULSE 11 10", { impulse: true });
  assert.equal(ok.tc, true);
  assert.equal(ok.ship.vPos, 11);

  const bad = await runMove("IMPULSE 12 10", { impulse: true });
  assert.equal(bad.tc, false);
  assert.match(bad.io.output, /Maximum speed warp 1\./);
});

test("moving to your own location is rejected", async () => {
  const { tc, io } = await runMove("MOVE 10 10");
  assert.equal(tc, false);
  assert.match(io.output, /Own location used!/);
});

test("MOVE with no coordinates prompts, then uses the typed answer", async () => {
  const { tc, ship, io } = await runMove("MOVE", { prompt: ["12 13"] });
  assert.equal(tc, true);
  assert.equal(ship.vPos, 12);
  assert.equal(ship.hPos, 13);
  assert.match(io.output, /Coordinates: /);
});

test("a move that overdraws energy leaves it negative (loop will detect death)", async () => {
  const { tc, ship } = await runMove("MOVE 12 13", { energy: 100 });
  assert.equal(tc, true);
  assert.ok(ship.energy < 0, `energy=${ship.energy}`);
});

// ── Verbosity-aware messages (source DECWAR.FOR:2180–2207) ────────────────────────────────

/** Re-run move with a specific oflg by replaying tokens after setting verbosity. */
async function moveWithOflg(cmd: string, oflg: -1 | 0 | 1, impulse = false) {
  const setup = shipAt10();
  setup.session.oflg = oflg;
  setup.session.tokens = tokenize(cmd, 0).tokens;
  const tc = await move(setup.state, setup.session, impulse);
  return { ...setup, tc };
}

test("IMPULSE >1 sector emits MOVE1A prefix only in LONG mode", async () => {
  const med = await moveWithOflg("IMPULSE 12 10", 0, true);
  assert.doesNotMatch(med.io.output, /impulse engines won't take it/);
  assert.match(med.io.output, /Maximum speed warp 1\./);

  const long = await moveWithOflg("IMPULSE 12 10", 1, true);
  assert.match(long.io.output, /Captain, the impulse engines won't take it\./);
  assert.match(long.io.output, /Maximum speed warp 1\./);
});

test("warp > 6 emits MOVE3S in MEDIUM, MOVE3L (Engineering Officer) in LONG", async () => {
  const med = await moveWithOflg("MOVE 25 25", 0);
  assert.match(med.io.output, /Maximum warp 6\./);
  assert.doesNotMatch(med.io.output, /Engineering Officer/);

  const long = await moveWithOflg("MOVE 25 25", 1);
  assert.match(long.io.output, /Engineering Officer:  The engines won't take it Captain\./);
  assert.match(long.io.output, /I can only give you warp 6\./);
});

test("warp 5/6 overheat warning: MOVE5S in SHORT, MOVE5L in MEDIUM, ENGOFF+MOVE5L in LONG", async () => {
  // Warp 5 (ia=5) at (15, 10) from (10, 10).  Doesn't reliably overheat — just verify
  // the pre-overheat warning text is correct per oflg.
  const short = await moveWithOflg("MOVE 15 10", -1);
  assert.match(short.io.output, /Engines overheating\./);
  assert.doesNotMatch(short.io.output, /our engines are overheating/);
  assert.doesNotMatch(short.io.output, /Engineering Officer/);

  const med = await moveWithOflg("MOVE 15 10", 0);
  assert.match(med.io.output, /Captain, our engines are overheating!/);
  assert.doesNotMatch(med.io.output, /Engineering Officer/);

  const long = await moveWithOflg("MOVE 15 10", 1);
  assert.match(long.io.output, /Engineering Officer:  /);
  assert.match(long.io.output, /Captain, our engines are overheating!/);
});

test("MOVE09 stardate-repair message appears after overheat damage in non-SHORT modes", async () => {
  // Iterate seeds until one triggers the warp-6 overheat damage path under MEDIUM
  // mode, then verify MOVE09 message present.
  for (let seed = 1; seed <= 200; seed++) {
    const setup = shipAt10({ seed });
    setup.session.oflg = 0; // medium
    setup.session.tokens = tokenize("MOVE 16 10", 0).tokens;
    await move(setup.state, setup.session, false);
    if (setup.io.output.includes("units of damage")) {
      // Overheat fired in MEDIUM → MOVE09 should be present.
      assert.match(setup.io.output, /Captain, repairs will take approximately/);
      assert.match(setup.io.output, /stardates\./);
      return;
    }
  }
  assert.fail("expected at least one seed to trigger warp-6 overheat");
});

test("MOVE09 suppressed under SHORT mode after overheat damage", async () => {
  for (let seed = 1; seed <= 200; seed++) {
    const setup = shipAt10({ seed });
    setup.session.oflg = -1; // SHORT
    setup.session.tokens = tokenize("MOVE 16 10", 0).tokens;
    await move(setup.state, setup.session, false);
    if (setup.io.output.includes("units of damage")) {
      assert.doesNotMatch(setup.io.output, /repairs will take/);
      return;
    }
  }
  assert.fail("expected at least one seed to trigger warp-6 overheat");
});

test("warp-damaged ship trying warp >3 emits MOVE2S in MEDIUM, MOVE2L in LONG", async () => {
  const med = shipAt10();
  med.state.devices[1]![2] = 100; // DEV.KDWARP = 2 (warp engines)
  med.session.tokens = tokenize("MOVE 15 10", 0).tokens; // ia=5
  med.session.oflg = 0;
  await move(med.state, med.session, false);
  assert.match(med.io.output, /Engines damaged, warp 3 max\./);

  const long = shipAt10();
  long.state.devices[1]![2] = 100;
  long.session.tokens = tokenize("MOVE 15 10", 0).tokens;
  long.session.oflg = 1;
  await move(long.state, long.session, false);
  assert.match(long.io.output, /our warp engines are damaged\.  I can only give you warp 3\./);
});

test("through the loop: MOVE advances the stardate and STATUS reflects the new state", async () => {
  const { state, session, io } = shipAt10({ seed: 1, lines: ["MOVE 12 13", "STATUS", "QUIT"] });
  io.onHangup = () => {
    session.hungup = true;
  };
  const end = await runSession(state, session);
  assert.equal(end, "quit");
  assert.match(io.output, /SDate {5}1/); // stardate advanced by postMove
  assert.match(io.output, /Loc {4}12-13/); // moved
  assert.match(io.output, /Ener {3}4928\.0/); // 49280 ×10 → 4928.0
});
