// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 Eric Freeman and The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * Tests for ROMSPK — "The Romulan speaks!" taunt broadcast (G-4). Pinned to
 * WARMAC.MAC:6196–6320 (entry romspk). Covers:
 *   • Broadcast audience routing (iran(3) → all/Federation/Empire masks).
 *   • Single-player taunt (TELL ROMULAN response path, DECWAR.FOR:4011).
 *   • Body composition: leadin + adjective + species + object [+ 's' on broadcast] + '!'.
 *   • Sender DISP = DX.ROM * 100 so OUTMSG renders the sender as "Romulan".
 *   • Spawn-time 1-in-10 trigger inside ROMDRV.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../../src/core/state.ts";
import { createSession } from "../../src/core/session.ts";
import { activate } from "../../src/lifecycle/activate.ts";
import { romdrv } from "../../src/combat/romulan.ts";
import { romspkBroadcast, romspkSingle } from "../../src/combat/romspk.ts";
import { tell } from "../../src/commands/tell.ts";
import { tokenize } from "../../src/parser/tokenizer.ts";
import { Rng } from "../../src/core/rng.ts";
import { DX, TEAM, KNPLAY } from "../../src/core/constants.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";

const ALL_MASK = (1 << KNPLAY) - 1;
const FED_MASK = (1 << (KNPLAY / 2)) - 1;
const EMP_MASK = ALL_MASK ^ FED_MASK;

function setup(seed = 42) {
  const state = createInitialGameState(new Rng(seed));
  const io = new ScriptedIo([]);
  const session = createSession(io);
  activate(state, session); // who=1 (Fed Excalibur)
  io.output = "";
  return { state, session, io };
}

// ── Broadcast ────────────────────────────────────────────────────────────────────────────

test("romspkBroadcast addresses one of three audience masks (iran(3))", () => {
  const { state } = setup();
  romspkBroadcast(state);
  // The recipient mask was either ALL/FED/EMP. With seed=42 the first iran(3) draw will
  // give a known result, but the safer assertion is just that ONE of the 18 player queues
  // got a message and it's a valid audience mask.
  let totalQueued = 0;
  let firstMask = 0;
  for (let i = 1; i <= KNPLAY; i++) {
    if (state.bus.hasMsgs(i)) {
      totalQueued++;
      const m = state.bus.drainMsgs(i)[0]!;
      firstMask = firstMask || m.recipients;
    }
  }
  assert.ok(totalQueued > 0, "broadcast must reach at least one recipient");
  assert.ok(
    firstMask === ALL_MASK || firstMask === FED_MASK || firstMask === EMP_MASK,
    `recipient mask ${firstMask.toString(16)} should be one of ALL/FED/EMP`,
  );
});

test("romspkBroadcast uses dispfr = DX.ROM * 100 so OUTMSG renders sender as 'Romulan'", () => {
  const { state } = setup();
  romspkBroadcast(state);
  for (let i = 1; i <= KNPLAY; i++) {
    if (state.bus.hasMsgs(i)) {
      const m = state.bus.drainMsgs(i)[0]!;
      assert.equal(m.dispfr, DX.ROM * 100);
      return;
    }
  }
  assert.fail("no broadcast message queued");
});

test("romspkBroadcast body ends with 's!' (pluralized object)", () => {
  const { state } = setup();
  romspkBroadcast(state);
  for (let i = 1; i <= KNPLAY; i++) {
    if (state.bus.hasMsgs(i)) {
      const m = state.bus.drainMsgs(i)[0]!;
      assert.match(m.body, /s!$/); // ends with 's!' for broadcast
      return;
    }
  }
  assert.fail("no broadcast message queued");
});

test("romspkBroadcast body composes leadin + adjective + species + object", () => {
  const { state } = setup();
  romspkBroadcast(state);
  for (let i = 1; i <= KNPLAY; i++) {
    if (state.bus.hasMsgs(i)) {
      const m = state.bus.drainMsgs(i)[0]!;
      // Body should contain a broadcast leadin verb and a known adjective.
      assert.match(
        m.body,
        /^(Death to|Destruction to|I will crush|Prepare to die, ).*?(mindless|worthless|ignorant|idiotic|stupid)/,
      );
      // ...and a species + object word.
      assert.match(m.body, /(sub-Romulan|human|klingon) (mutants|cretins|toads|worms|parasites)!$/);
      return;
    }
  }
  assert.fail("no broadcast message queued");
});

// ── Single-player taunt ──────────────────────────────────────────────────────────────────

test("romspkSingle delivers to only the target's bit", () => {
  const { state } = setup();
  romspkSingle(state, 1, TEAM.FED);
  assert.ok(state.bus.hasMsgs(1));
  for (let i = 2; i <= KNPLAY; i++) {
    assert.equal(state.bus.hasMsgs(i), false, `slot ${i} should NOT have a message`);
  }
});

test("romspkSingle body ends with '!' (no 's' pluralization for single)", () => {
  const { state } = setup();
  romspkSingle(state, 1, TEAM.FED);
  const m = state.bus.drainMsgs(1)[0]!;
  assert.match(m.body, /[^s]!$/); // ends with a non-s char then '!'
});

test("romspkSingle uses one of the personal lead-ins", () => {
  const { state } = setup();
  romspkSingle(state, 1, TEAM.FED);
  const m = state.bus.drainMsgs(1)[0]!;
  assert.match(
    m.body,
    /^(You have aroused my wrath, |You will witness my vengence, |May you be attacked by a slime-devil, |I will reduce you to quarks, )/,
  );
});

// ── TELL ROMULAN integration ─────────────────────────────────────────────────────────────

test("TELL ROMULAN with the Romulan alive triggers a single-player taunt back at the sender", async () => {
  const { state, session } = setup();
  state.romulan.exists = true;
  session.tokens = tokenize("TELL ROMULAN; hello", 0).tokens;
  session.lineBuf = "TELL ROMULAN; hello";
  await tell(state, session);
  assert.ok(state.bus.hasMsgs(1), "sender should have received a taunt from Romulan");
  const m = state.bus.drainMsgs(1)[0]!;
  assert.equal(m.dispfr, DX.ROM * 100);
});

test("TELL ROMULAN with the Romulan dead emits TELL07 'cannot raise the Romulan'", async () => {
  const { state, session, io } = setup();
  state.romulan.exists = false;
  session.tokens = tokenize("TELL ROMULAN; hello", 0).tokens;
  session.lineBuf = "TELL ROMULAN; hello";
  await tell(state, session);
  assert.match(io.output, /cannot raise the Romulan/);
  assert.equal(state.bus.hasMsgs(1), false);
});

// ── Spawn-time integration ───────────────────────────────────────────────────────────────

test("Romulan spawn occasionally triggers romspkBroadcast (1-in-10 iran(10)==1 gate)", () => {
  // Force-spawn the Romulan and verify romspk only fires when iran(10) returns 1. We loop
  // across seeds until both branches are exercised at least once.
  let sawTaunt = false;
  let sawNoTaunt = false;
  for (let seed = 1; seed <= 200 && (!sawTaunt || !sawNoTaunt); seed++) {
    const { state, session } = setup(seed);
    // Drive ROMDRV until the Romulan spawns. moveCounter needs to be large enough and r5 != 5.
    state.romulan.moveCounter = state.numply * 3 + 1;
    // Track baseline message counts pre-spawn.
    const preCounts: number[] = [];
    for (let i = 1; i <= KNPLAY; i++) preCounts[i] = state.bus.hasMsgs(i) ? 1 : 0;
    romdrv(state);
    if (!state.romulan.exists) continue; // spawn declined (r5 === 5) — try next seed
    // Did any new ROM-sender message appear past the pre-state?
    let romMessages = 0;
    for (let i = 1; i <= KNPLAY; i++) {
      if (!state.bus.hasMsgs(i)) continue;
      const msgs = state.bus.drainMsgs(i);
      for (const m of msgs) if (m.dispfr === DX.ROM * 100) romMessages++;
    }
    if (romMessages > 0) sawTaunt = true;
    else sawNoTaunt = true;
    void session;
  }
  assert.ok(sawTaunt, "expected at least one seeded spawn to fire romspkBroadcast");
  assert.ok(sawNoTaunt, "expected at least one seeded spawn to skip the taunt");
});
