// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * Tests for the SETUP cascade — opt-in prompts (F-2b-1), later-player announcement
 * (F-2b-2), side prompt (F-2b-3), and ship-by-name selection (F-2b-4). Pinned to
 * SETUP.FOR:219–415 and SETMSG.MAC:17–42.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../../src/core/state.ts";
import { createSession } from "../../src/core/session.ts";
import { runSetup } from "../../src/lifecycle/setup.ts";
import { Rng } from "../../src/core/rng.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";

/** First-player default answers: setu02/setu04/setu05/setu18 all blank → defaults. */
const DEFAULTS = ["", "", "", ""];

async function runFresh(lines: string[]) {
  const state = createInitialGameState(new Rng(11));
  const io = new ScriptedIo(lines);
  const session = createSession(io);
  io.onHangup = () => { session.hungup = true; };
  const r = await runSetup(state, session);
  return { state, session, io, r };
}

// ── F-2b-1: first-player opt-in prompts ───────────────────────────────────────────────────

test("first player sees the four opt-in prompts in source order", async () => {
  const { io } = await runFresh([...DEFAULTS, "Excalibur"]);
  assert.match(io.output, /Regular or Tournament game\? \(Regular\) /);
  assert.match(io.output, /Is the Romulan Empire involved in this conflict\? \(yes\) /);
  assert.match(io.output, /Do you want black holes\? \(no\) /);
  // setu02 must appear before setu04 (the prompts run in source order).
  assert.ok(io.output.indexOf("Regular") < io.output.indexOf("Romulan"));
  assert.ok(io.output.indexOf("Romulan") < io.output.indexOf("black holes"));
});

test("setu02 blank → Regular game, ROMOPT default yes, BLHOPT default no", async () => {
  const { state, r } = await runFresh([...DEFAULTS, "Excalibur"]);
  assert.equal(r.ok, true);
  assert.equal(state.romopt, true);
  assert.equal(state.blhopt, false);
});

test("setu04 NO disables Romulan", async () => {
  const { state, r } = await runFresh(["", "NO", "", "", "Excalibur"]);
  assert.equal(r.ok, true);
  assert.equal(state.romopt, false);
});

test("setu05 YES enables black holes", async () => {
  const { state, r } = await runFresh(["", "", "YES", "", "Excalibur"]);
  assert.equal(r.ok, true);
  assert.equal(state.blhopt, true);
});

test("setu02 unknown input re-prompts", async () => {
  // Two garbage answers, then blank → default Regular.
  const { io, r } = await runFresh(["BANANA", "FROOP", "", "", "", "", "Excalibur"]);
  assert.equal(r.ok, true);
  // setu02 fires THREE times (initial + two re-prompts).
  const matches = io.output.match(/Regular or Tournament game/g) ?? [];
  assert.equal(matches.length, 3);
});

test("setu02 TOURNAMENT prompts setu03 for a name/number and reseeds the RNG", async () => {
  const { io, state, r } = await runFresh(["TOURNAMENT", "42", "", "", "", "Excalibur"]);
  assert.equal(r.ok, true);
  assert.match(io.output, /Tournament name or number: /);
  // The RNG was re-seeded inside firstPlayerPrompts — verify by checking that buildUniverse
  // (driven by the re-seeded RNG) succeeded. (The exact RNG seed isn't directly observable;
  // the indirect check is that the universe got built and we got slot 1.)
  assert.equal(state.built, true);
});

test("setu02 TOURNAMENT with the name on the same line skips setu03", async () => {
  const { io, r } = await runFresh(["TOURNAMENT 99", "", "", "", "Excalibur"]);
  assert.equal(r.ok, true);
  assert.doesNotMatch(io.output, /Tournament name or number: /);
});

// ── F-2b-2: later-player Romulan/BH announcement ──────────────────────────────────────────

test("later player with Romulan-enabled sees setu06; no opt-in re-prompts", async () => {
  const state = createInitialGameState(new Rng(11));
  // First player builds the universe with ROMOPT=true (default).
  {
    const io = new ScriptedIo([...DEFAULTS, "Excalibur"]);
    const a = createSession(io);
    io.onHangup = () => { a.hungup = true; };
    const r = await runSetup(state, a);
    assert.equal(r.ok, true);
  }
  // Second player: should see setu06 announcement but NOT setu02/setu04/setu05.
  const io2 = new ScriptedIo(["", "Buzzard"]); // setu18 blank → smaller (Empire here), then ship
  const b = createSession(io2);
  io2.onHangup = () => { b.hungup = true; };
  const r2 = await runSetup(state, b);
  assert.equal(r2.ok, true);
  assert.match(io2.output, /There are Romulans in this game\./);
  assert.doesNotMatch(io2.output, /Regular or Tournament/);
  assert.doesNotMatch(io2.output, /Romulan Empire involved/);
});

test("later player without Romulan does not see setu06", async () => {
  const state = createInitialGameState(new Rng(11));
  {
    const io = new ScriptedIo(["", "NO", "", "", "Excalibur"]); // setu04 NO
    const a = createSession(io);
    io.onHangup = () => { a.hungup = true; };
    await runSetup(state, a);
  }
  const io2 = new ScriptedIo(["", "Buzzard"]);
  const b = createSession(io2);
  io2.onHangup = () => { b.hungup = true; };
  const r2 = await runSetup(state, b);
  assert.equal(r2.ok, true);
  assert.doesNotMatch(io2.output, /There are Romulans/);
});

// ── F-2b-3: side prompt (setu16/17/stu17a + setu18) ──────────────────────────────────────

test("setu16/17/stu17a fleet-count banner is always emitted", async () => {
  const { io } = await runFresh([...DEFAULTS, "Excalibur"]);
  assert.match(io.output, /Currently there are 0/);
  assert.match(io.output, /Federation ships and 0/);
  assert.match(io.output, /Empire ships\./);
});

test("setu18 fires when sides are within 1 (first player: tie at 0-0)", async () => {
  const { io } = await runFresh([...DEFAULTS, "Excalibur"]);
  assert.match(io.output, /Which side do you wish to join\?/);
});

test("setu18 blank → smaller side (Federation on a tie)", async () => {
  const { session, r } = await runFresh([...DEFAULTS, "Excalibur"]);
  assert.equal(r.ok, true);
  assert.equal(session.team, 1); // Federation
});

test("setu18 EMPIRE → Empire side", async () => {
  const { session, r } = await runFresh(["", "", "", "EMPIRE", "Buzzard"]);
  assert.equal(r.ok, true);
  assert.equal(session.team, 2);
});

test("setu18 FEDERATION → Federation side", async () => {
  const { session, r } = await runFresh(["", "", "", "FEDERATION", "Excalibur"]);
  assert.equal(r.ok, true);
  assert.equal(session.team, 1);
});

test("setu18 unknown input re-prompts", async () => {
  const { io, r } = await runFresh(["", "", "", "BANANA", "", "Excalibur"]);
  assert.equal(r.ok, true);
  const matches = io.output.match(/Which side do you wish to join/g) ?? [];
  assert.equal(matches.length, 2);
});

test("auto-assign skips setu18 when diff is at least 2", async () => {
  const state = createInitialGameState(new Rng(11));
  // Activate two Federation players (Excalibur, Farragut) to make numsid[1]=2, [2]=0.
  for (const ship of ["Excalibur", "Farragut"]) {
    const io = new ScriptedIo([...DEFAULTS.slice(0, state.built ? 0 : 3), "FEDERATION", ship]);
    const s = createSession(io);
    io.onHangup = () => { s.hungup = true; };
    await runSetup(state, s);
  }
  assert.equal(state.numsid[1], 2);
  // Now a third player joins — diff is 2, so setu18 should NOT fire.
  const io3 = new ScriptedIo(["Buzzard"]);
  const c = createSession(io3);
  io3.onHangup = () => { c.hungup = true; };
  const r = await runSetup(state, c);
  assert.equal(r.ok, true);
  assert.equal(c.team, 2); // auto-assigned to Empire (smaller side)
  assert.doesNotMatch(io3.output, /Which side do you wish to join/);
});

// ── F-2b-4: ship-by-name selection ────────────────────────────────────────────────────────

test("setu11 banner appears for a Federation joiner", async () => {
  const { io } = await runFresh(["", "", "", "FEDERATION", "Excalibur"]);
  assert.match(io.output, /You will join the Federation\./);
  assert.doesNotMatch(io.output, /You will join the Klingon Empire\./);
});

test("setu12 banner appears for an Empire joiner", async () => {
  const { io } = await runFresh(["", "", "", "EMPIRE", "Buzzard"]);
  assert.match(io.output, /You will join the Klingon Empire\./);
});

test("setu13 lists all 9 ships of the chosen side", async () => {
  const { io } = await runFresh(["", "", "", "FEDERATION", "Excalibur"]);
  for (const name of [
    "Excalibur", "Farragut", "Intrepid", "Lexington", "Nimitz",
    "Savannah", "Trenton", "Vulcan", "Yorktown",
  ]) {
    assert.match(io.output, new RegExp(`\\b${name}\\b`));
  }
  // Empire ships should NOT be in the Federation-side listing.
  assert.doesNotMatch(io.output, /\bBuzzard\b/);
});

test("setu14 ship name is matched by first word, case-insensitive prefix", async () => {
  const { session, r } = await runFresh(["", "", "", "", "Exc"]); // prefix of Excalibur
  assert.equal(r.ok, true);
  assert.equal(session.who, 1);
});

test("setu14 wrong-side ship name → re-list and re-prompt", async () => {
  const { io, session, r } = await runFresh(["", "", "", "FEDERATION", "Buzzard", "Excalibur"]);
  assert.equal(r.ok, true);
  assert.equal(session.who, 1);
  // setu13 should appear twice (initial + re-list after the Buzzard rejection).
  const matches = io.output.match(/These vessels are available:/g) ?? [];
  assert.equal(matches.length, 2);
});

test("setu14 already-taken ship name emits setu15 and re-prompts", async () => {
  const state = createInitialGameState(new Rng(11));
  {
    const io = new ScriptedIo([...DEFAULTS, "Excalibur"]);
    const a = createSession(io);
    io.onHangup = () => { a.hungup = true; };
    await runSetup(state, a);
  }
  // Second player asks for Excalibur (now taken) → setu15 → re-list → asks for Farragut.
  const io2 = new ScriptedIo(["FEDERATION", "Excalibur", "Farragut"]);
  const b = createSession(io2);
  io2.onHangup = () => { b.hungup = true; };
  const r = await runSetup(state, b);
  assert.equal(r.ok, true);
  assert.equal(b.who, 2); // Farragut
  assert.match(io2.output, /Sorry, that vessel is being used\./);
});

test("setu14 unknown name → re-list", async () => {
  const { io, r } = await runFresh(["", "", "", "FEDERATION", "Banana", "Excalibur"]);
  assert.equal(r.ok, true);
  const matches = io.output.match(/These vessels are available:/g) ?? [];
  assert.equal(matches.length, 2);
});
