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
