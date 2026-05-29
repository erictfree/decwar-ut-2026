// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 Eric Freeman and The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * Tests for TORP (the TORPEDOS command) and TORDAM. Pinned to DECWAR.FOR:4099–4176, 4238–4436.
 * Golden values captured from this implementation (shields-down hits go critical because the
 * torp's earlier draws warm `rana`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState, newlyActivatedShip } from "../../src/core/state.ts";
import { createSession } from "../../src/core/session.ts";
import { torpedos } from "../../src/commands/torpedos.ts";
import { renderHit } from "../../src/comms/outhit.ts";
import { tokenize } from "../../src/parser/tokenizer.ts";
import { Rng } from "../../src/core/rng.ts";
import { KCRIT, DEV } from "../../src/core/constants.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";
import type { GameState } from "../../src/core/state.ts";
import type { Session } from "../../src/core/session.ts";

function setup(seed = 1): { state: GameState; session: Session; io: ScriptedIo } {
  const state = createInitialGameState(new Rng(seed));
  const io = new ScriptedIo([]);
  const session = createSession(io);
  session.who = 1;
  session.team = 1;
  session.player = true;
  const f = newlyActivatedShip();
  f.vPos = 10;
  f.hPos = 10;
  f.shieldCond = -1; // firer shields down (no aim wobble term)
  f.shieldPct = 0;
  state.ships[1] = f;
  state.alive[1] = -1;
  state.numply = 1;
  state.numsid[1] = 1;
  state.board.setdsp(10, 10, 101);
  return { state, session, io };
}

function addEnemy(state: GameState, v: number, h: number, shieldsUp = false): void {
  const e = newlyActivatedShip();
  e.vPos = v;
  e.hPos = h;
  if (shieldsUp) {
    e.shieldCond = 1;
    e.shieldPct = 1000;
  } else {
    e.shieldCond = -1;
    e.shieldPct = 0;
  }
  state.ships[10] = e;
  state.alive[10] = -1;
  state.board.setdsp(v, h, 210);
}

async function firedHits(state: GameState, session: Session): Promise<string> {
  const io = session.io as ScriptedIo;
  const before = io.output.length;
  for (const e of state.bus.drainHits(1)) renderHit(state, session, e);
  return io.output.slice(before);
}

test("a torpedo hits an enemy, consumes a torp, and renders a torpedo hit", async () => {
  const { state, session } = setup(1);
  addEnemy(state, 10, 13);
  session.tokens = tokenize("TORP 1 10 13", 0).tokens;
  const tc = await torpedos(state, session);
  assert.equal(tc, true);
  assert.equal(state.ships[1]!.torps, 9); // one torpedo consumed
  assert.equal(state.ships[10]!.damage, 3907);
  // MEDIUM default verbosity: <ihita> unit T<hittee> (source 2000: outc('T') for iwhat=2 medium)
  assert.match(await firedHits(state, session), /unit TBuzzard/);
});

test("a full-shielded target can deflect the torpedo (no hull damage)", async () => {
  const { state, session } = setup(1);
  addEnemy(state, 10, 13, true); // shields up, full
  session.tokens = tokenize("TORP 1 10 13", 0).tokens;
  await torpedos(state, session);
  assert.equal(state.ships[10]!.damage, 0);
  // MEDIUM deflection: outh29 "deflected T" (source 2440)
  assert.match(await firedHits(state, session), /deflected T/);
});

test("a torpedo that reaches no object misses", async () => {
  const { state, session } = setup(1); // no enemy placed
  session.tokens = tokenize("TORP 1 10 20", 0).tokens; // target beyond torp travel
  const tc = await torpedos(state, session);
  assert.equal(tc, true);
  // MEDIUM iwhat=4: 'T' + torp# + outh13 " miss " (source 4700/5100)
  assert.match(await firedHits(state, session), /T1 miss/);
});

test("critically-damaged tubes refuse to fire", async () => {
  const { state, session, io } = setup();
  state.devices[1]![DEV.KDTORP] = KCRIT;
  session.tokens = tokenize("TORP 1 10 13", 0).tokens;
  assert.equal(await torpedos(state, session), false);
  assert.match(io.output, /Torpedo tubes critically damaged\./);
});

test("a ship out of torpedoes cannot fire", async () => {
  const { state, session, io } = setup();
  state.ships[1]!.torps = 0;
  session.tokens = tokenize("TORP 1 10 13", 0).tokens;
  assert.equal(await torpedos(state, session), false);
  assert.match(io.output, /already used your supply of torpedoes/);
});

test("an out-of-range target is refused", async () => {
  const { state, session, io } = setup();
  addEnemy(state, 10, 30); // 20 sectors away
  session.tokens = tokenize("TORP 1 10 30", 0).tokens;
  assert.equal(await torpedos(state, session), false);
  assert.match(io.output, /Target out of range\./);
});

test("firing at your own location is refused", async () => {
  const { state, session, io } = setup();
  session.tokens = tokenize("TORP 1 10 10", 0).tokens;
  assert.equal(await torpedos(state, session), false);
  assert.match(io.output, /Own location used!/);
});

// ── Cooldown stamp (source DECWAR.FOR:4315 `tpaus` accumulator) ───────────────────────────

test("tobank cooldown accumulates per-torp, including KDTORP damage term", async () => {
  const { state, session } = setup();
  // Plant a target so the burst can fire cleanly.
  const enemy = newlyActivatedShip();
  enemy.vPos = 10; enemy.hPos = 13;
  state.ships[10] = enemy;
  state.alive[10] = -1;
  state.board.setdsp(10, 13, 210);
  // Damage the torpedo tubes by 200 ms-worth (source treats shpdam(who,KDTORP) as
  // ms penalty per torp, just like phaser's KDPHAS term).
  state.devices[1]![DEV.KDTORP] = 200;
  const before = state.clock.monotonic();
  session.tokens = tokenize("TORP 3 10 13", 0).tokens;
  await torpedos(state, session);
  // Expected: tobank = before + 3 * ((slwest+1)*1000 + 200).  slwest default = 1, so
  // per-torp = 2000 + 200 = 2200.  Three torps = 6600.  Allow small monotonic slop.
  const expected = before + 3 * ((state.slwest + 1) * 1000 + 200);
  assert.ok(
    Math.abs(session.tobank - expected) <= 5,
    `tobank ${session.tobank} should be ~${expected} (slop ≤ 5ms)`,
  );
});

test("misfire-aborted burst only stamps tobank for the torps that actually fired", async () => {
  // Find a seed where torp 1 misfires (iran(100) > 96).  With seed=7 this happens on
  // the first iran(100) draw of the per-torp loop.  If no misfire occurs in 50 seeds,
  // fall back gracefully.
  for (let seed = 1; seed <= 200; seed++) {
    const { state, session } = setup(seed);
    const enemy = newlyActivatedShip();
    enemy.vPos = 10; enemy.hPos = 13;
    state.ships[10] = enemy;
    state.alive[10] = -1;
    state.board.setdsp(10, 13, 210);
    const before = state.clock.monotonic();
    session.tokens = tokenize("TORP 3 10 13", 0).tokens;
    const io = session.io as ScriptedIo;
    io.output = "";
    await torpedos(state, session);
    if (!io.output.includes("MISFIRES")) continue; // no misfire this seed → keep trying
    // A misfire on torp 1 means only 1 torp fired.  Verify tobank stamped for 1 torp's
    // worth, NOT for ntorp=3.  Per-torp = (slwest+1)*1000 + KDTORP_damage.  KDTORP may
    // have been damaged by the misfire's iran(5)==5 branch — pull current value.
    const perTorp = (state.slwest + 1) * 1000; // KDTORP damage was 0 at fire time
    assert.ok(
      session.tobank - before <= perTorp * 2,
      `seed=${seed}: misfire-aborted 3-torp burst should stamp ≤ 2 torps worth (got ${session.tobank - before})`,
    );
    return;
  }
  // No seed produced a misfire in 200 tries — extremely unlikely (4% per torp × 3 × 200).
  assert.fail("expected at least one seed to produce a misfire");
});
