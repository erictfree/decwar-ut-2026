/**
 * Tests for the LIST family — LIST/SUMMARY/BASES/PLANETS/TARGETS.
 * Pinned to DECWAR.FOR:1352–1396 (entries), LSTSCN 1512–1739 (grammar defaults),
 * LSTOUT/LSTSUM/LSTOBJ 1952–2110 (render): per-object lines with enemy `*` flag,
 * summary counts with " in range"/" in specified range"/" in game".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../../src/core/state.ts";
import { createSession } from "../../src/core/session.ts";
import { activate } from "../../src/lifecycle/activate.ts";
import { list } from "../../src/commands/list.ts";
import { tokenize } from "../../src/parser/tokenizer.ts";
import { Rng } from "../../src/core/rng.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";
import type { GameState } from "../../src/core/state.ts";
import type { Session } from "../../src/core/session.ts";

function fresh(): { state: GameState; a: Session } {
  const state = createInitialGameState(new Rng(1));
  const a = createSession(new ScriptedIo([]));
  activate(state, a); // Fed #1 Excalibur
  return { state, a };
}

const out = (s: Session): string => (s.io as ScriptedIo).output;
const reset = (s: Session): void => { (s.io as ScriptedIo).output = ""; };
const setArgs = (s: Session, line: string): void => {
  s.tokens = tokenize(line, 0).tokens;
};

test("LIST with no args reports objects in game (default range ∞)", () => {
  const { state, a } = fresh();
  setArgs(a, "LIST");
  list(state, a, "LIST");
  const o = out(a);
  assert.match(o, /Excalibur/); // own ship in the listing
  assert.match(o, /Federation base|Empire base/);
});

test("SUMMARY emits counted lines with 'in game' for range ∞", () => {
  const { state, a } = fresh();
  setArgs(a, "SUMMARY");
  list(state, a, "SUMMARY");
  const o = out(a);
  assert.match(o, /\d+ Federation ships? in game/);
  assert.match(o, /\d+ neutral planets? in game/);
});

test("BASES (own side) lists only own-team bases, no `*` flag", () => {
  const { state, a } = fresh();
  setArgs(a, "BASES");
  list(state, a, "BASES");
  const o = out(a);
  assert.match(o, /Federation base/);
  assert.doesNotMatch(o, /Empire base/);
  assert.doesNotMatch(o, /^\*/m); // no enemy flags for own-side BASES
});

test("PLANETS defaults to range 10 → 'in range' summary string when SUMMARY added", () => {
  const { state, a } = fresh();
  setArgs(a, "PLANETS SUMMARY"); // exercise the SUMMARY keyword
  list(state, a, "PLANETS");
  // Either no planets in range (nothing) or a count line ending with " in range"
  const o = out(a);
  if (/\d+ \w+ planets?/.test(o)) {
    assert.match(o, / in range/);
    assert.doesNotMatch(o, / in game/);
  }
});

test("TARGETS lists enemy objects + Romulan, no `*` flag (since they're targets)", () => {
  const { state, a } = fresh();
  // Force a Romulan within range to make this deterministic
  state.romulan.exists = true;
  state.romulan.vPos = state.ships[a.who]!.vPos;
  state.romulan.hPos = state.ships[a.who]!.hPos + 1;
  setArgs(a, "TARGETS");
  list(state, a, "TARGETS");
  const o = out(a);
  assert.match(o, /Romulan/);
  assert.doesNotMatch(o, /^\*/m); // TARGETS suppresses the enemy `*` (per LSTOBJ:2092)
});

test("user-supplied range marks SUMMARY lines with 'in specified range'", () => {
  const { state, a } = fresh();
  setArgs(a, "SUMMARY 30");
  list(state, a, "SUMMARY");
  const o = out(a);
  if (/\d+ \w+/.test(o)) {
    assert.match(o, / in specified range/);
  }
});

test("unrecognized keyword → 'Illegal keyword' (faithful lsts02; covers deferred grammar)", () => {
  const { state, a } = fresh();
  setArgs(a, "LIST CLOSEST"); // CLOSEST is deferred → illegal in this build
  list(state, a, "LIST");
  // tokenizer caps at 5 chars → "CLOSE"; faithful to the original error rendering
  assert.match(out(a), /Illegal keyword CLOSE/);
});

// ── scanMask "known" gating (source LSTUPD DECWAR.FOR:1921–1932) ──────────────────────────

test("LIST TARGETS on a fresh game hides far-away enemy bases (must scan first)", () => {
  const { state, a } = fresh();
  // All Empire bases were placed > KRANGE from Excalibur with a high probability under
  // a fresh build; with Rng(1) the positions are deterministic. Verify NONE of the
  // unscanned far bases leak into TARGETS, by checking that no Empire base inside the
  // listing has distance > KRANGE.
  setArgs(a, "LIST TARGETS");
  list(state, a, "LIST");
  const o = out(a);
  const ship = state.ships[a.who]!;
  const enemyBases = state.bases[2]!;
  for (let i = 1; i <= 10; i++) {
    const b = enemyBases[i]!;
    const distance = Math.max(Math.abs(b.vPos - ship.vPos), Math.abs(b.hPos - ship.hPos));
    if (distance > 10) {
      // Out of KRANGE + never scanned → must NOT appear in the listing.
      assert.ok(
        !o.includes(`${b.vPos}-${b.hPos}`),
        `Empire base at (${b.vPos},${b.hPos}) [distance ${distance}] should be hidden`,
      );
    }
  }
});

test("LIST TARGETS reveals an enemy base once SCAN covers its sector", () => {
  const { state, a } = fresh();
  // Find a far-away Empire base, mark it scanned by our team, verify it now appears.
  const ship = state.ships[a.who]!;
  const enemyBases = state.bases[2]!;
  let farBase = null;
  for (let i = 1; i <= 10; i++) {
    const b = enemyBases[i]!;
    const distance = Math.max(Math.abs(b.vPos - ship.vPos), Math.abs(b.hPos - ship.hPos));
    if (distance > 10) { farBase = b; break; }
  }
  assert.ok(farBase, "expected at least one Empire base outside KRANGE for this seed");
  farBase!.scanMask |= a.team; // simulate SCAN having covered it earlier

  setArgs(a, "LIST TARGETS");
  list(state, a, "LIST");
  const o = out(a);
  assert.ok(
    o.includes(`${farBase!.vPos}-${farBase!.hPos}`),
    `scanned Empire base at (${farBase!.vPos},${farBase!.hPos}) should appear in TARGETS`,
  );
});

test("LIST TARGETS hides the Romulan until detected (scanMask)", () => {
  const { state, a } = fresh();
  // Plant the Romulan far away with no scanMask set.
  state.romulan.exists = true;
  state.romulan.vPos = 5;
  state.romulan.hPos = 5;
  state.romulan.scanMask = 0;
  const ship = state.ships[a.who]!;
  // Verify the planted location is actually out of KRANGE (sanity guard on fixture).
  const dist = Math.max(Math.abs(ship.vPos - 5), Math.abs(ship.hPos - 5));
  assert.ok(dist > 10, `fixture: Romulan must be out of range (got ${dist})`);

  setArgs(a, "LIST TARGETS");
  list(state, a, "LIST");
  const beforeScan = out(a);
  assert.doesNotMatch(beforeScan, /Romulan/);

  // Now mark it as scanned by this team and try again.
  state.romulan.scanMask |= a.team;
  reset(a);
  setArgs(a, "LIST TARGETS");
  list(state, a, "LIST");
  assert.match(out(a), /Romulan/);
});

test("TARGETS ALL extends range to infinity but keeps the enemy-only filter (source DECWAR.FOR:1700)", () => {
  // Source: `if (((imask .and. SIDMSK) .eq. 0) .and. (cmd .ne. TARCMD)) smask = …` —
  // for TARCMD (TARGETS), ALL does NOT flip friendly bits on; it only extends range.
  // Without this guard our port was showing the player's own ship + own bases under
  // "TARGETS ALL", which is misleading (friendlies are not targets).
  const { state, a } = fresh();
  // Pre-scan a far Empire base so we can verify the range extension is taking effect.
  const enemyBases = state.bases[2]!;
  let farBase = null;
  for (let i = 1; i <= 10; i++) {
    const b = enemyBases[i]!;
    const distance = Math.max(
      Math.abs(b.vPos - state.ships[a.who]!.vPos),
      Math.abs(b.hPos - state.ships[a.who]!.hPos),
    );
    if (distance > 10) { farBase = b; break; }
  }
  assert.ok(farBase, "test fixture: need at least one far Empire base");
  farBase!.scanMask |= a.team;

  setArgs(a, "TARGETS ALL");
  list(state, a, "TARGETS");
  const o = out(a);
  // Friendlies must NOT appear (the bug fix).
  assert.doesNotMatch(o, /Excalibur|Farragut|Intrepid|Lexington|Nimitz|Savannah|Trenton|Vulcan|Yorktown/);
  assert.doesNotMatch(o, /Federation base/);
  // The pre-scanned far Empire base SHOULD appear (proves range was extended past KRANGE).
  assert.ok(
    o.includes(`${farBase!.vPos}-${farBase!.hPos}`),
    `far scanned Empire base at (${farBase!.vPos},${farBase!.hPos}) should appear under TARGETS ALL`,
  );
});

test("LIST ALL DOES flip friendly bits on (per source — only TARGETS is special-cased)", () => {
  const { state, a } = fresh();
  setArgs(a, "LIST ALL");
  list(state, a, "LIST");
  const o = out(a);
  // Own Fed bases (always visible) + Excalibur (own ship under f.fed=true) should appear.
  assert.match(o, /Federation base/);
  assert.match(o, /Excalibur/);
});

test("LIST TARGETS shows everything when pasflg is set (privileged god-mode)", () => {
  const { state, a } = fresh();
  a.pasflg = true;
  setArgs(a, "LIST TARGETS");
  list(state, a, "LIST");
  const o = out(a);
  // With pasflg, every Empire base should be visible regardless of distance/scan.
  const enemyBases = state.bases[2]!;
  for (let i = 1; i <= 10; i++) {
    const b = enemyBases[i]!;
    assert.ok(
      o.includes(`${b.vPos}-${b.hPos}`),
      `pasflg should show Empire base at (${b.vPos},${b.hPos})`,
    );
  }
});

test("FRIENDLY shows own ships; ENEMY shows the other side", () => {
  const { state, a } = fresh();
  // Add a Buzzard (Empire) so there is enemy content, then move it adjacent to Excalibur
  // so it's within KRANGE for the visibility gate (LSTUPD source line 1923).
  const b = createSession(new ScriptedIo([]));
  activate(state, b);
  const me = state.ships[a.who]!;
  const enemyShip = state.ships[b.who]!;
  // Move Buzzard adjacent — clear old cell, set new cell, update ship struct so the
  // board.disp(s.vPos, s.hPos) > 0 invariant LIST relies on still holds.
  state.board.setdsp(enemyShip.vPos, enemyShip.hPos, 0);
  enemyShip.vPos = me.vPos;
  enemyShip.hPos = me.hPos + 1;
  state.board.setdsp(enemyShip.vPos, enemyShip.hPos, 2 * 100 + b.who);

  setArgs(a, "LIST FRIENDLY");
  list(state, a, "LIST");
  let o = out(a);
  assert.match(o, /Excalibur/);
  assert.doesNotMatch(o, /Buzzard/);

  reset(a);
  setArgs(a, "LIST ENEMY");
  list(state, a, "LIST");
  o = out(a);
  assert.match(o, /Buzzard/);
  assert.doesNotMatch(o, /Excalibur/);
});
