// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * Tests for the kill-queue / reincarnation path (F-2b-5). Pinned to DECWAR.FOR:1094–1107
 * (KQADD inside FREE), 1325–1348 (KQSRCH), and SETUP.FOR:322–356 (kindex≠0 paths:
 * same-ship reuse, defect prompt, reassigned prompt).
 *
 * KILCHK (5-minute reincarnation-wait countdown) is dead code in the reconstruction
 * (PARAM.FOR sets KWAIT=0; SETUP.FOR defines but never calls KILCHK), so it's deferred.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../../src/core/state.ts";
import { createSession } from "../../src/core/session.ts";
import { runSetup } from "../../src/lifecycle/setup.ts";
import { freeShip, kqsrch } from "../../src/lifecycle/activate.ts";
import { Rng } from "../../src/core/rng.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";

const DEFAULTS = ["", "", "", ""]; // setu02, setu04, setu05, setu18

async function activate(state: ReturnType<typeof createInitialGameState>, identity: string, lines: string[]) {
  const io = new ScriptedIo(lines);
  const session = createSession(io);
  session.identity = identity;
  io.onHangup = () => { session.hungup = true; };
  const r = await runSetup(state, session);
  return { session, io, r };
}

// ── KQADD (in freeShip) ──────────────────────────────────────────────────────────────────

test("freeShip records a kill-queue entry with this session's identity", async () => {
  const state = createInitialGameState(new Rng(11));
  const { session, r } = await activate(state, "user-1", [...DEFAULTS, "Excalibur"]);
  assert.equal(r.ok, true);
  const who = session.who;
  const team = session.team;
  freeShip(state, session);
  assert.equal(state.nkill, 1);
  const idx = kqsrch(state, "user-1");
  assert.equal(idx, 1);
  assert.equal(state.kilque[idx]?.identity, "user-1");
  assert.equal(state.kilque[idx]?.team, team);
  assert.equal(state.kilque[idx]?.who, who);
});

test("freeShip with an empty identity does NOT add a record", async () => {
  const state = createInitialGameState(new Rng(11));
  const { session } = await activate(state, "", [...DEFAULTS, "Excalibur"]);
  freeShip(state, session);
  assert.equal(state.nkill, 0);
});

test("freeShip on the same identity updates the existing slot (no duplicate)", async () => {
  const state = createInitialGameState(new Rng(11));
  // First death.
  {
    const { session } = await activate(state, "user-1", [...DEFAULTS, "Excalibur"]);
    freeShip(state, session);
  }
  // Reincarnate (same-ship reuse) then die again.
  {
    const { session, r } = await activate(state, "user-1", []);
    assert.equal(r.ok, true);
    assert.equal(session.who, 1);
    freeShip(state, session);
  }
  assert.equal(state.nkill, 1); // still one record, just updated
});

test("KQADD wraps at KQLEN (round-robin via kilndx)", async () => {
  const state = createInitialGameState(new Rng(11));
  // 11 distinct identities each grab Excalibur (free after the previous one dies) and die.
  // First identity carries the opt-in prompts (first player); later ones just take the
  // freed Federation slot.
  let lines = [...DEFAULTS, "Excalibur"];
  for (let i = 0; i < 11; i++) {
    const { session, r } = await activate(state, `u${i}`, lines);
    assert.equal(r.ok, true, `cycle ${i} failed to activate`);
    freeShip(state, session);
    lines = ["FEDERATION", "Excalibur"]; // numsid[1]==0 after the death → setu18 prompts
  }
  assert.equal(state.nkill, 10); // capped at KQLEN
  assert.equal(state.kilndx, 1);  // wrapped back to 1
  // u0 was overwritten by u10; u1..u10 remain.
  assert.equal(kqsrch(state, "u0"), 0);
  assert.notEqual(kqsrch(state, "u10"), 0);
});

// ── KQSRCH ────────────────────────────────────────────────────────────────────────────────

test("kqsrch returns 0 for an unknown identity", () => {
  const state = createInitialGameState(new Rng(11));
  assert.equal(kqsrch(state, "unknown"), 0);
  assert.equal(kqsrch(state, ""), 0);
});

test("kqsrch returns the 1-based slot index of the matching record", async () => {
  const state = createInitialGameState(new Rng(11));
  const { session } = await activate(state, "user-A", [...DEFAULTS, "Excalibur"]);
  freeShip(state, session);
  assert.equal(kqsrch(state, "user-A"), 1);
});

// ── Same-ship reuse (kindex≠0, side has room, old ship still free) ───────────────────────

test("same-ship reuse: reincarnation skips side+ship prompts", async () => {
  const state = createInitialGameState(new Rng(11));
  // Build the universe via a first player.
  {
    const { session, r } = await activate(state, "user-A", [...DEFAULTS, "Excalibur"]);
    assert.equal(r.ok, true);
    freeShip(state, session);
  }
  // Reincarnate "user-A" — no scripted input needed (no prompts should fire).
  const { session, io, r } = await activate(state, "user-A", []);
  assert.equal(r.ok, true);
  assert.equal(session.who, 1); // Excalibur, the same ship
  // Crucially, NO side prompt and NO ship-selection prompt should have fired.
  assert.doesNotMatch(io.output, /Which side do you wish to join/);
  assert.doesNotMatch(io.output, /These vessels are available:/);
});

// ── Reassigned prompt (kindex≠0, side has room, old ship now taken) ──────────────────────

test("reassigned: old ship taken → REASSIGNED prompt, YES → ship selection on same team", async () => {
  const state = createInitialGameState(new Rng(11));
  // Player A activates and dies.
  {
    const { session, r } = await activate(state, "user-A", [...DEFAULTS, "Excalibur"]);
    assert.equal(r.ok, true);
    freeShip(state, session);
  }
  // Player B takes Excalibur.
  {
    const { session, r } = await activate(state, "user-B", ["FEDERATION", "Excalibur"]);
    assert.equal(r.ok, true);
    assert.equal(session.who, 1);
  }
  // Player A returns — old ship taken → REASSIGNED prompt → YES → pick Farragut.
  const { session, io, r } = await activate(state, "user-A", ["YES", "Farragut"]);
  assert.equal(r.ok, true);
  assert.equal(session.who, 2); // Farragut
  assert.match(io.output, /Sorry, Captain, but the Excalibur/);
  assert.match(io.output, /has been reassigned\./);
  assert.match(io.output, /Do you wish to choose another ship\?/);
  assert.match(io.output, /These vessels are available:/);
  // No side prompt — same team is preserved.
  assert.doesNotMatch(io.output, /Which side do you wish to join/);
});

test("reassigned: NO at the prompt → setup bails out", async () => {
  const state = createInitialGameState(new Rng(11));
  {
    const { session } = await activate(state, "user-A", [...DEFAULTS, "Excalibur"]);
    freeShip(state, session);
  }
  {
    const { session } = await activate(state, "user-B", ["FEDERATION", "Excalibur"]);
    assert.equal(session.who, 1);
  }
  const { session, r } = await activate(state, "user-A", ["NO"]);
  assert.equal(r.ok, false);
  assert.equal(session.who, 0);
});

// ── Defect prompt (kindex≠0, side full) ──────────────────────────────────────────────────

/**
 * Build a state where user-A has died and the Federation is FULL at the moment they
 * return. We do this by running one real activate→die cycle (to seed the kill-queue
 * record + build the universe), then directly setting `numsid[1]=9` and marking all 9 Fed
 * slots as playing. Faithful to the condition `numsid(team) >= knplay/2` that triggers
 * the DEFECT prompt at SETUP.FOR:329, without requiring 18 real activations.
 */
async function fillFedAndKillUserA(state: ReturnType<typeof createInitialGameState>) {
  const { session } = await activate(state, "user-A", [...DEFAULTS, "Excalibur"]);
  freeShip(state, session);
  state.numsid[1] = 9;
  for (let i = 1; i <= 9; i++) state.alive[i] = -1;
}

test("defect: old team full → DEFECT prompt, YES → ship selection on other team", async () => {
  const state = createInitialGameState(new Rng(11));
  await fillFedAndKillUserA(state);
  // fed-0 returns → kqsrch finds (team=1, who=1) → Fed full → DEFECT prompt → YES.
  const { session, io, r } = await activate(state, "user-A", ["YES", "Buzzard"]);
  assert.equal(r.ok, true);
  assert.equal(session.team, 2); // defected
  assert.equal(session.who, 10); // Buzzard
  assert.match(io.output, /Sorry, Captain, but the Federation/);
  assert.match(io.output, /fleet is at capacity\./);
  assert.match(io.output, /Do you wish to defect\?/);
  assert.match(io.output, /You will join the Klingon Empire\./);
});

test("defect: NO at the prompt → setup bails out", async () => {
  const state = createInitialGameState(new Rng(11));
  await fillFedAndKillUserA(state);
  const { session, r } = await activate(state, "user-A", ["NO"]);
  assert.equal(r.ok, false);
  assert.equal(session.who, 0);
});

// ── Fresh path (no kill-queue record) ────────────────────────────────────────────────────

test("a never-died identity falls through to the fresh side+ship prompts", async () => {
  const state = createInitialGameState(new Rng(11));
  // No prior activation → kqsrch returns 0 → side+ship prompts fire.
  const { io, r } = await activate(state, "newbie", [...DEFAULTS, "Excalibur"]);
  assert.equal(r.ok, true);
  assert.match(io.output, /Which side do you wish to join/);
  assert.match(io.output, /These vessels are available:/);
});
