/**
 * PRLOC + OSDEC + cursor model — Phase A fidelity pass.
 *
 * Source: DECWAR.FOR:3065–3084 (PRLOC); WARMAC.MAC:2236–2284 (ONUM./OSN1.);
 * WARMAC.MAC:1545–1577 (ochr. hcpos/blank); WARMAC.MAC:1962–1986 (tab/spaces).
 * Param constants: KREL=-1, KBOTH=0, KABS=1; SHORT=-1, MEDIUM=0, LONG=1 (PARAM.FOR:133–141).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { osdec, odec, prloc } from "../../src/render/format.ts";
import { out, tab, spaces, crlf, ocrl } from "../../src/render/output.ts";
import { createSession } from "../../src/core/session.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";
import { COORD, OFLG } from "../../src/core/constants.ts";

// ── osdec ────────────────────────────────────────────────────────────────────────────────────

test("osdec: '+' for >0, '-' for <0, no sign for 0", () => {
  assert.equal(osdec(5, 0), "+5");
  assert.equal(osdec(-3, 0), "-3");
  assert.equal(osdec(0, 0), "0");
});

test("osdec: field width pads with leading spaces; sign counts toward width", () => {
  assert.equal(osdec(5, 3), " +5");
  assert.equal(osdec(-3, 3), " -3");
  assert.equal(osdec(0, 3), "  0");
  assert.equal(osdec(12, 4), " +12");
});

test("odec: '-' if negative, no sign for ≥0; pads to width", () => {
  assert.equal(odec(5, 0), "5");
  assert.equal(odec(5, 3), "  5");
  assert.equal(odec(-3, 3), " -3");
  assert.equal(odec(0, 2), " 0");
});

// ── prloc: the 3×3 prlflg × proflg matrix at a non-self target ───────────────────────────────
// Ship at (40,40), target (45,50). Δv=+5, Δh=+10.

test("prloc KABS+SHORT, w=0: 'v-h'", () => {
  assert.equal(prloc(45, 50, 0, 0, COORD.ABS, OFLG.SHORT, 40, 40), "45-50");
});

test("prloc KABS+MEDIUM, w=0: '@v-h'", () => {
  assert.equal(prloc(45, 50, 0, 0, COORD.ABS, OFLG.MEDIUM, 40, 40), "@45-50");
});

test("prloc KABS+LONG, w=0: '@v-h'", () => {
  assert.equal(prloc(45, 50, 0, 0, COORD.ABS, OFLG.LONG, 40, 40), "@45-50");
});

test("prloc KREL+SHORT, w=0: '+dv,+dh' (no '@', no abs)", () => {
  assert.equal(prloc(45, 50, 0, 0, COORD.REL, OFLG.SHORT, 40, 40), "+5,+10");
});

test("prloc KREL+MEDIUM, w=0: '+dv,+dh' (rel only never gets '@')", () => {
  assert.equal(prloc(45, 50, 0, 0, COORD.REL, OFLG.MEDIUM, 40, 40), "+5,+10");
});

test("prloc KBOTH+SHORT, w=0: 'v-h dv,dh'", () => {
  assert.equal(prloc(45, 50, 0, 0, COORD.BOTH, OFLG.SHORT, 40, 40), "45-50 +5,+10");
});

test("prloc KBOTH+MEDIUM, w=0: '@v-h dv,dh'", () => {
  assert.equal(prloc(45, 50, 0, 0, COORD.BOTH, OFLG.MEDIUM, 40, 40), "@45-50 +5,+10");
});

// ── prloc width semantics: w=2 → abs pads to 2, rel pads to tw=w+1=3 (sign counts) ───────────

test("prloc KBOTH+SHORT, w=2: abs and rel are width-padded ('-' for negatives)", () => {
  assert.equal(prloc(5, 50, 0, 2, COORD.BOTH, OFLG.SHORT, 40, 60), " 5-50 -35,-10");
});

// ── prloc self-loc skip: pdist=0 AND w==0 → drop the rel portion (and KBOTH space) ───────────

test("prloc KBOTH+MEDIUM, w=0, at self: '@v-h' (no trailing space, no rel)", () => {
  assert.equal(prloc(40, 40, 0, 0, COORD.BOTH, OFLG.MEDIUM, 40, 40), "@40-40");
});

test("prloc KBOTH+SHORT, w=2, at self: rel kept (w!=0 disables the skip)", () => {
  assert.equal(prloc(40, 40, 0, 2, COORD.BOTH, OFLG.SHORT, 40, 40), "40-40   0,  0");
});

test("prloc KREL+MEDIUM, w=0, at self: empty (the rel was the only output, and it's skipped)", () => {
  assert.equal(prloc(40, 40, 0, 0, COORD.REL, OFLG.MEDIUM, 40, 40), "");
});

// ── prloc trailing CRLF when prcflg != 0 ─────────────────────────────────────────────────────

test("prloc with prcflg=1 appends CRLF", () => {
  assert.equal(prloc(45, 50, 1, 0, COORD.ABS, OFLG.SHORT, 40, 40), "45-50\r\n");
});

// ── cursor model: hcpos / blank / tab / spaces / ocrl ────────────────────────────────────────

test("out advances hcpos one per printable char", () => {
  const s = createSession(new ScriptedIo([]));
  out(s, "hello");
  assert.equal(s.hcpos, 5);
});

test("CR in the stream resets hcpos to 0 and marks blank", () => {
  const s = createSession(new ScriptedIo([]));
  out(s, "abc\rxyz"); // CR resets
  // After "abc": hcpos=3. CR: hcpos=0, blank=-1. "xyz": hcpos=3.
  assert.equal(s.hcpos, 3);
  assert.equal(s.blank, -1);
});

test("LF in the stream increments blank but does NOT reset hcpos", () => {
  const s = createSession(new ScriptedIo([]));
  out(s, "ab\n");
  // "ab": hcpos=2. LF: blank++ → 1; hcpos unchanged.
  assert.equal(s.hcpos, 2);
  assert.equal(s.blank, 1);
});

test("tab pads with spaces to reach the absolute column", () => {
  const io = new ScriptedIo([]);
  const s = createSession(io);
  out(s, "Label:");      // hcpos=6
  tab(s, 26);
  assert.equal(s.hcpos, 26);
  assert.equal(io.output, "Label:" + " ".repeat(20));
});

test("tab is a no-op if we already passed the column", () => {
  const io = new ScriptedIo([]);
  const s = createSession(io);
  out(s, "long-label-already-30-chars-or-so");
  const before = io.output;
  tab(s, 5);
  assert.equal(io.output, before);
});

test("spaces emits n literal spaces and advances hcpos", () => {
  const io = new ScriptedIo([]);
  const s = createSession(io);
  out(s, "x");
  spaces(s, 4);
  assert.equal(io.output, "x    ");
  assert.equal(s.hcpos, 5);
});

test("ocrl suppresses a CRLF when previous line was already blank (blank>0, hcpos=0)", () => {
  const io = new ScriptedIo([]);
  const s = createSession(io);
  // Write a line, then a blank line via the stream. Source semantics:
  //   "x"  → hcpos=1
  //   "\r" → hcpos!=0 → blank=-1; hcpos=0
  //   "\n" → blank=0
  //   "\r" → hcpos==0 → blank unchanged (=0)
  //   "\n" → blank=1
  // Now blank=1, hcpos=0 — ocrl must suppress.
  out(s, "x\r\n\r\n");
  io.output = "";
  ocrl(s);
  assert.equal(io.output, "", "ocrl should suppress when blank>0 at left margin");
  // After writing real content, ocrl works again.
  out(s, "y");
  ocrl(s);
  assert.match(io.output, /y\r\n$/);
});

test("crlf is unconditional even when ocrl would suppress", () => {
  const io = new ScriptedIo([]);
  const s = createSession(io);
  out(s, "x\r\n\r\n"); // blank>0 at margin (same as above)
  io.output = "";
  crlf(s);
  assert.equal(io.output, "\r\n");
});
