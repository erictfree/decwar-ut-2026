// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 Eric Freeman and The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * Tests for the GTKN/NXTT. tokenizer. Pinned to WARMAC.MAC:1615–1804 and Deliverable #4 §1.1.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenize } from "../../src/parser/tokenizer.ts";
import { TOK } from "../../src/core/constants.ts";

test("splits on spaces, tabs, and commas; upcases", () => {
  const r = tokenize("move\t3,4", 0);
  assert.equal(r.tokens.ntok, 3);
  assert.deepEqual(
    r.tokens.text.slice(1, 4),
    ["MOVE", "3", "4"],
  );
  assert.equal(r.tokens.type[1], TOK.KALF);
  assert.equal(r.tokens.type[2], TOK.KINT);
  assert.equal(r.nextStart, -1);
});

test("collapses runs of spacing", () => {
  const r = tokenize("  status    energy  ", 0);
  assert.equal(r.tokens.ntok, 2);
  assert.deepEqual(r.tokens.text.slice(1, 3), ["STATU", "ENERG"]);
});

test("token text is capped at 5 characters", () => {
  const r = tokenize("torpedos", 0);
  assert.equal(r.tokens.text[1], "TORPE");
});

test("classifies integers, floats, and signs", () => {
  const r = tokenize("-5 3.5 +2 7", 0);
  assert.equal(r.tokens.type[1], TOK.KINT);
  assert.equal(r.tokens.val[1], -5); // leading '-' negates the stored value
  assert.equal(r.tokens.type[2], TOK.KFLT);
  assert.equal(r.tokens.val[2], 3.5);
  assert.equal(r.tokens.type[3], TOK.KINT);
  assert.equal(r.tokens.val[3], 2);
  assert.equal(r.tokens.val[4], 7);
});

test("a token with any non-numeric char is alphabetic with value 0", () => {
  const r = tokenize("1A", 0);
  assert.equal(r.tokens.type[1], TOK.KALF);
  assert.equal(r.tokens.val[1], 0);
});

test("the last token is always a KEOL sentinel", () => {
  const r = tokenize("status", 0);
  assert.equal(r.tokens.type[r.tokens.ntok + 1], TOK.KEOL);
});

test("'/' ends a command but leaves the remainder buffered (stacking)", () => {
  const r1 = tokenize("status/quit", 0);
  assert.equal(r1.tokens.ntok, 1);
  assert.equal(r1.tokens.text[1], "STATU");
  assert.ok(r1.nextStart > 0, "nextStart should point past the slash");

  const r2 = tokenize("status/quit", r1.nextStart);
  assert.equal(r2.tokens.text[1], "QUIT");
  assert.equal(r2.nextStart, -1);
});

test("';' ends the command and the line (comment)", () => {
  const r = tokenize("tell all ; hello there", 0);
  assert.deepEqual(r.tokens.text.slice(1, 3), ["TELL", "ALL"]);
  assert.equal(r.nextStart, -1); // rest is message/comment, not tokenized here
});

test("ptr records the char offset of each token", () => {
  const r = tokenize("ab cd", 0);
  assert.equal(r.tokens.ptr[1], 0);
  assert.equal(r.tokens.ptr[2], 3);
});

test("more than 14 words discards the line ('Too many words')", () => {
  const many = Array.from({ length: 20 }, (_, i) => `w${i}`).join(" ");
  const r = tokenize(many, 0);
  assert.equal(r.tooMany, true);
  assert.equal(r.tokens.ntok, 0);
  assert.equal(r.nextStart, -1);
});

test("empty / whitespace-only line yields zero tokens", () => {
  const r = tokenize("    ", 0);
  assert.equal(r.tokens.ntok, 0);
  assert.equal(r.nextStart, -1);
});
