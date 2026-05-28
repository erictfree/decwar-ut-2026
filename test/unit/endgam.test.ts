/**
 * Tests for ENDGAM (G-7) — game-end detection and banner broadcast. Pinned to
 * DECWAR.FOR:955–1000 (subroutine ENDGAM). Verifies:
 *   • Threshold detection: `nplnet === 0 && (nbase[1] === 0 || nbase[2] === 0)`
 *   • Multi-value endflg: 1 = decisive, -2 = total destruction
 *   • Idempotence: calling endgam twice doesn't double-broadcast
 *   • Broadcast routing via the messageBus → all 18 player bits
 *   • Per-session personalized suffix selection (endgm5/6/7/8)
 *   • Runtime loop tears down sessions when endflg !== 0
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState, newlyActivatedShip } from "../../src/core/state.ts";
import { createSession } from "../../src/core/session.ts";
import { endgam, personalizedEndgamBanner } from "../../src/lifecycle/endgam.ts";
import { runSession } from "../../src/runtime/loop.ts";
import { Rng } from "../../src/core/rng.ts";
import { TEAM, KNPLAY } from "../../src/core/constants.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";

const ALL_MASK = (1 << KNPLAY) - 1;

function freshGame() {
  const state = createInitialGameState(new Rng(1));
  // Manually set live counts so we don't have to call activate / buildUniverse.
  state.nplnet = 60;
  state.nbase[1] = 10;
  state.nbase[2] = 10;
  return state;
}

// ── Threshold detection ──────────────────────────────────────────────────────────────────

test("endgam returns false when planets remain", () => {
  const state = freshGame();
  state.nplnet = 1; // still one planet
  state.nbase[1] = 0;
  state.nbase[2] = 10;
  assert.equal(endgam(state), false);
  assert.equal(state.endflg, 0);
});

test("endgam returns false when both sides still have bases", () => {
  const state = freshGame();
  state.nplnet = 0;
  state.nbase[1] = 1;
  state.nbase[2] = 1;
  assert.equal(endgam(state), false);
  assert.equal(state.endflg, 0);
});

test("endgam sets endflg=1 when planets gone + Federation bases gone (Empire wins)", () => {
  const state = freshGame();
  state.nplnet = 0;
  state.nbase[1] = 0;
  state.nbase[2] = 5;
  assert.equal(endgam(state), true);
  assert.equal(state.endflg, 1);
});

test("endgam sets endflg=1 when planets gone + Empire bases gone (Federation wins)", () => {
  const state = freshGame();
  state.nplnet = 0;
  state.nbase[1] = 5;
  state.nbase[2] = 0;
  assert.equal(endgam(state), true);
  assert.equal(state.endflg, 1);
});

test("endgam sets endflg=-2 when nplnet AND both nbase are zero (total destruction)", () => {
  const state = freshGame();
  state.nplnet = 0;
  state.nbase[1] = 0;
  state.nbase[2] = 0;
  assert.equal(endgam(state), true);
  assert.equal(state.endflg, -2);
});

test("endgam is idempotent — repeated calls don't change endflg or double-broadcast", () => {
  const state = freshGame();
  state.nplnet = 0;
  state.nbase[1] = 0;
  state.nbase[2] = 5;
  endgam(state);
  // Count broadcast messages.
  let preCount = 0;
  for (let i = 1; i <= KNPLAY; i++) preCount += state.bus.hasMsgs(i) ? 1 : 0;
  endgam(state);
  endgam(state);
  let postCount = 0;
  for (let i = 1; i <= KNPLAY; i++) postCount += state.bus.hasMsgs(i) ? 1 : 0;
  assert.equal(preCount, postCount, "no additional broadcasts");
});

// ── Broadcast routing ────────────────────────────────────────────────────────────────────

test("endgam broadcasts the banner to ALL_MASK", () => {
  const state = freshGame();
  state.nplnet = 0;
  state.nbase[1] = 0;
  state.nbase[2] = 5;
  endgam(state);
  // Every slot 1..18 should have a queued message.
  for (let i = 1; i <= KNPLAY; i++) {
    assert.ok(state.bus.hasMsgs(i), `slot ${i} should have a broadcast banner`);
    const m = state.bus.drainMsgs(i)[0]!;
    assert.equal(m.recipients, ALL_MASK);
    assert.match(m.body, /THE WAR IS OVER!!/);
    assert.match(m.body, /Klingon Empire is VICTORIOUS!!/);
  }
});

test("endgam total-destruction banner includes ENDGM1 (both sides lose)", () => {
  const state = freshGame();
  state.nplnet = 0;
  state.nbase[1] = 0;
  state.nbase[2] = 0;
  endgam(state);
  const m = state.bus.drainMsgs(1)[0]!;
  assert.match(m.body, /entire known galaxy/);
  assert.match(m.body, /BOTH sides lose!!/);
});

// ── Per-session personalized suffix ──────────────────────────────────────────────────────

test("personalizedEndgamBanner: Fed loses → ENDGM5 for Federation captains", () => {
  const state = freshGame();
  state.endflg = 1;
  state.nbase[1] = 0;
  state.nbase[2] = 5;
  const io = new ScriptedIo([]);
  const session = createSession(io);
  session.team = TEAM.FED;
  const out = personalizedEndgamBanner(state, session);
  assert.match(out, /Klingon slave planet/);
});

test("personalizedEndgamBanner: Empire wins → ENDGM7 for Empire captains", () => {
  const state = freshGame();
  state.endflg = 1;
  state.nbase[1] = 0;
  state.nbase[2] = 5;
  const io = new ScriptedIo([]);
  const session = createSession(io);
  session.team = TEAM.EMP;
  const out = personalizedEndgamBanner(state, session);
  assert.match(out, /Begin slave operations/);
});

test("personalizedEndgamBanner: Fed wins → ENDGM6 for Federation, ENDGM8 for Empire", () => {
  const state = freshGame();
  state.endflg = 1;
  state.nbase[1] = 5;
  state.nbase[2] = 0;
  const io = new ScriptedIo([]);
  const fed = createSession(io);
  fed.team = TEAM.FED;
  assert.match(personalizedEndgamBanner(state, fed), /Freedom again reigns/);
  const emp = createSession(io);
  emp.team = TEAM.EMP;
  assert.match(personalizedEndgamBanner(state, emp), /self-destruction procedure/);
});

// ── Runtime loop integration ─────────────────────────────────────────────────────────────

test("runSession exits with 'quit' when endflg is set at the next prompt cycle", async () => {
  const state = freshGame();
  // Set up an active session.
  const io = new ScriptedIo([]); // no input — will hit the idle heartbeat
  const session = createSession(io);
  session.who = 1;
  session.team = TEAM.FED;
  state.ships[1] = newlyActivatedShip();
  state.ships[1]!.vPos = 10;
  state.ships[1]!.hPos = 10;
  state.alive[1] = -1;
  state.numply = 1;

  // Fire endgam BEFORE runSession — the broadcast banner is now in slot 1's queue.
  state.nplnet = 0;
  state.nbase[1] = 0;
  state.nbase[2] = 5;
  endgam(state);

  const end = await runSession(state, session);
  assert.equal(end, "quit");
  // Banner appeared (drained via the messageBus + suffix written via personalizedEndgam).
  assert.match(io.output, /THE WAR IS OVER!!/);
  assert.match(io.output, /Klingon slave planet/);
});
