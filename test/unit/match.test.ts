// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 Eric Freeman and The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * Tests for the EQUAL matcher and command dispatch resolution. Pinned to WARMAC.MAC:4320–4372
 * and the GETCMD loop (DECWAR.FOR:1238–1249); Deliverable #4 §1.2/§1.3.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { equal } from "../../src/parser/match.ts";
import { matchCommand, CMD } from "../../src/commands/table.ts";

test("equal: exact match returns -2", () => {
  assert.equal(equal("STATU", "STATUS"), -2); // token is 5-char-capped; 5 chars all match
  assert.equal(equal("DOCK", "DOCK"), -2);
  assert.equal(equal("MOVE", "MOVE"), -2);
});

test("equal: strict prefix returns -1", () => {
  assert.equal(equal("ST", "STATUS"), -1);
  assert.equal(equal("D", "DOCK"), -1);
});

test("equal: no match returns 0", () => {
  assert.equal(equal("X", "DOCK"), 0);
  assert.equal(equal("DOCKX", "DOCK"), 0); // sub longer than master
  assert.equal(equal("", "DOCK"), 0); // empty substring never matches
  assert.equal(equal(" ", "DOCK"), 0); // leading space never matches
});

test("equal is case-insensitive", () => {
  assert.equal(equal("st", "STATUS"), -1);
  assert.equal(equal("Status", "STATUS"), -2);
});

test("matchCommand resolves an unambiguous abbreviation", () => {
  assert.deepEqual(matchCommand("STATUS"), { cmd: CMD.STATUS, ambiguous: false });
  assert.deepEqual(matchCommand("ST"), { cmd: CMD.STATUS, ambiguous: false });
  assert.deepEqual(matchCommand("Q"), { cmd: CMD.QUIT, ambiguous: false });
  assert.deepEqual(matchCommand("MOVE"), { cmd: 11, ambiguous: false });
});

test("matchCommand flags ambiguous one-character prefixes", () => {
  // S → SCAN/SET/SHIELDS/SRSCAN/STATUS/SUMMARY ; T → TARGETS/TELL/TIME/TORPEDOS/TRACTOR
  assert.equal(matchCommand("S").ambiguous, true);
  assert.equal(matchCommand("T").ambiguous, true);
  assert.equal(matchCommand("B").ambiguous, true); // BASES / BUILD
});

test("matchCommand returns cmd 0 for an unknown word", () => {
  assert.deepEqual(matchCommand("XYZZY"), { cmd: 0, ambiguous: false });
});

test("two characters disambiguate the in-game set", () => {
  assert.equal(matchCommand("SC").ambiguous, false); // SCAN
  assert.equal(matchCommand("SH").ambiguous, false); // SHIELDS
  assert.equal(matchCommand("ST").ambiguous, false); // STATUS
  assert.equal(matchCommand("TO").ambiguous, false); // TORPEDOS
});
