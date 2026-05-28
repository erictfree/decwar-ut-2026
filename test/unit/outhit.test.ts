/**
 * OUTHIT rendering tests (G-1) — pinned to DECWAR.FOR:2393–2585. Verifies the three-way
 * `oflg` dispatch for each of the 15 iwhat codes, the 40-col line wrap, the displacement
 * glyphs (`>` / `--` / `displaced to`), and the LONG-only base critical-hit cascade
 * (OUTH31–34).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState, newlyActivatedShip } from "../../src/core/state.ts";
import { createSession } from "../../src/core/session.ts";
import { renderHit } from "../../src/comms/outhit.ts";
import { Rng } from "../../src/core/rng.ts";
import { OFLG, DX, COORD } from "../../src/core/constants.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";
import type { HitEvent } from "../../src/comms/messageBus.ts";

function setup(oflg: -1 | 0 | 1 = OFLG.MEDIUM) {
  const state = createInitialGameState(new Rng(1));
  const io = new ScriptedIo([]);
  const session = createSession(io);
  session.who = 1;
  session.team = 1;
  session.oflg = oflg;
  session.ocflg = COORD.ABS;
  state.ships[1] = newlyActivatedShip();
  state.ships[1]!.vPos = 10;
  state.ships[1]!.hPos = 10;
  state.alive[1] = -1;
  return { state, session, io };
}

function evt(over: Partial<HitEvent>): HitEvent {
  return {
    iwhat: 1,
    dispfr: DX.FSHP * 100 + 1, // Excalibur
    dispto: DX.ESHP * 100 + 10, // Buzzard
    ihita: 4000, // 400.0
    critdv: 0,
    critdm: 0,
    vfrom: 10,
    hfrom: 10,
    vto: 10,
    hto: 13,
    klflg: 0,
    shcnfr: 1,
    shstfr: 1000,
    shcnto: 1,
    shstto: 818,
    shjump: 0,
    ...over,
  };
}

function render(e: HitEvent, oflg: -1 | 0 | 1 = OFLG.MEDIUM): string {
  const { state, session, io } = setup(oflg);
  renderHit(state, session, e);
  return io.output;
}

// ── iwhat=1 phaser hit ───────────────────────────────────────────────────────────────────

test("iwhat=1 phaser hit, MEDIUM: 'P' verb (outh06 elided)", () => {
  const out = render(evt({ iwhat: 1 }), OFLG.MEDIUM);
  assert.match(out, /Excalibur/);
  assert.match(out, /unit PBuzzard/);
  assert.doesNotMatch(out, /phaser hit on/);
});

test("iwhat=1 phaser hit, LONG: 'phaser hit on ' verb (outh06)", () => {
  const out = render(evt({ iwhat: 1 }), OFLG.LONG);
  assert.match(out, /makes/);
  assert.match(out, /phaser hit on/);
});

test("iwhat=1 phaser hit, SHORT: bare 'P' + no ' unit ' suffix", () => {
  const out = render(evt({ iwhat: 1, ihita: 200 }), OFLG.SHORT);
  // Source 2465: SHORT path emits '  ' (two spaces) between hitter verb and hittee.
  assert.match(out, /P {2}Buzzard/);
  assert.doesNotMatch(out, / unit /);
});

// ── iwhat=2 torpedo hit ──────────────────────────────────────────────────────────────────

test("iwhat=2 torpedo hit, MEDIUM: 'T' verb", () => {
  const out = render(evt({ iwhat: 2 }), OFLG.MEDIUM);
  assert.match(out, /TBuzzard/);
  assert.doesNotMatch(out, /torpedo hit on/);
});

test("iwhat=2 torpedo hit, LONG: 'torpedo hit on ' verb (outh05)", () => {
  const out = render(evt({ iwhat: 2 }), OFLG.LONG);
  assert.match(out, /torpedo hit on/);
});

// ── iwhat=3 torpedo deflected by shields ─────────────────────────────────────────────────

test("iwhat=3 deflection, MEDIUM: 'deflected T' (outh29)", () => {
  const out = render(evt({ iwhat: 3 }), OFLG.MEDIUM);
  assert.match(out, /deflected T/);
});

test("iwhat=3 deflection, LONG: 'has torpedo deflected by' (outh30)", () => {
  const out = render(evt({ iwhat: 3 }), OFLG.LONG);
  assert.match(out, /has torpedo deflected by/);
});

// ── iwhat=4 torpedo miss ─────────────────────────────────────────────────────────────────

test("iwhat=4 torpedo miss, MEDIUM: 'T<n> miss ' (outh13)", () => {
  const out = render(evt({ iwhat: 4, critdv: 1 }), OFLG.MEDIUM);
  assert.match(out, /T1 miss /);
});

test("iwhat=4 torpedo miss, LONG: 'Weapons Officer...torpedo <n> lost'", () => {
  const out = render(evt({ iwhat: 4, critdv: 2 }), OFLG.LONG);
  assert.match(out, /Weapons Officer/);
  assert.match(out, /torpedo 2 lost/);
});

// ── iwhat=5 torpedo into black hole ──────────────────────────────────────────────────────

test("iwhat=5 black hole, MEDIUM: ' gulp '", () => {
  const out = render(evt({ iwhat: 5, critdv: 1 }), OFLG.MEDIUM);
  assert.match(out, /T1 gulp/);
});

test("iwhat=5 black hole, LONG: 'swallowed by black hole'", () => {
  const out = render(evt({ iwhat: 5, critdv: 1 }), OFLG.LONG);
  assert.match(out, /swallowed by black hole/);
});

// ── iwhat=6 star unaffected ──────────────────────────────────────────────────────────────

test("iwhat=6 star unaffected, MEDIUM: 'U'", () => {
  const out = render(evt({ iwhat: 6, dispfr: DX.STAR * 100, shstfr: 0 }), OFLG.MEDIUM);
  assert.match(out, /U\r\n$/);
});

test("iwhat=6 star unaffected, LONG: 'UNAFFECTED by Photon Torpedo!'", () => {
  const out = render(evt({ iwhat: 6, dispfr: DX.STAR * 100, shstfr: 0 }), OFLG.LONG);
  assert.match(out, /UNAFFECTED by Photon Torpedo!/);
});

// ── iwhat=7 star goes nova ───────────────────────────────────────────────────────────────

test("iwhat=7 star goes nova, MEDIUM: 'N'", () => {
  const out = render(evt({ iwhat: 7, dispfr: DX.STAR * 100, shstfr: 0 }), OFLG.MEDIUM);
  assert.match(out, /N\r\n$/);
});

test("iwhat=7 star goes nova, LONG: 'novas' (outh01)", () => {
  const out = render(evt({ iwhat: 7, dispfr: DX.STAR * 100, shstfr: 0 }), OFLG.LONG);
  assert.match(out, /novas/);
});

// ── iwhat=8 star damages someone ─────────────────────────────────────────────────────────

test("iwhat=8 star damages, MEDIUM: 'N' verb + ' unit '", () => {
  const out = render(
    evt({ iwhat: 8, dispfr: DX.STAR * 100, shstfr: 0, ihita: 800 }),
    OFLG.MEDIUM,
  );
  assert.match(out, /unit NBuzzard/);
});

test("iwhat=8 star damages, LONG: 'hit on ' (outh04)", () => {
  const out = render(
    evt({ iwhat: 8, dispfr: DX.STAR * 100, shstfr: 0, ihita: 800 }),
    OFLG.LONG,
  );
  assert.match(out, /hit on/);
});

// ── iwhat=9 base under attack (galaxy-wide) ──────────────────────────────────────────────

test("iwhat=9 base alert, SHORT: ' A'", () => {
  const out = render(
    evt({ iwhat: 9, dispto: DX.FBAS * 100 + 1, shstto: 1000 }),
    OFLG.SHORT,
  );
  assert.match(out, / A\r\n$/);
});

test("iwhat=9 base alert, LONG: ' is under attack, Captain.' (outh16)", () => {
  const out = render(
    evt({ iwhat: 9, dispto: DX.FBAS * 100 + 1, shstto: 1000 }),
    OFLG.LONG,
  );
  assert.match(out, /is under attack, Captain\./);
});

// ── iwhat=10 base destroyed ──────────────────────────────────────────────────────────────

test("iwhat=10 base destroyed, MEDIUM: ' dead' (outh19)", () => {
  const out = render(
    evt({ iwhat: 10, dispto: DX.FBAS * 100 + 1, shstto: 0, klflg: 2 }),
    OFLG.MEDIUM,
  );
  assert.match(out, / dead/);
});

test("iwhat=10 base destroyed, LONG: ' has been destroyed, Captain.' (outh18)", () => {
  const out = render(
    evt({ iwhat: 10, dispto: DX.FBAS * 100 + 1, shstto: 0, klflg: 2 }),
    OFLG.LONG,
  );
  assert.match(out, /has been destroyed, Captain\./);
});

// ── iwhat=11 Romulan detected ────────────────────────────────────────────────────────────

test("iwhat=11 Romulan detected, LONG: 'detected' (outh20)", () => {
  const out = render(
    evt({ iwhat: 11, dispfr: DX.ROM * 100, vfrom: 30, hfrom: 40 }),
    OFLG.LONG,
  );
  assert.match(out, /Romulan/);
  assert.match(out, /detected/);
});

test("iwhat=11 Romulan detected, MEDIUM: name + location, no 'detected'", () => {
  const out = render(
    evt({ iwhat: 11, dispfr: DX.ROM * 100, vfrom: 30, hfrom: 40 }),
    OFLG.MEDIUM,
  );
  assert.match(out, /Romulan/);
  assert.doesNotMatch(out, /detected/);
});

// ── iwhat=12 ship-to-ship energy transfer ────────────────────────────────────────────────

test("iwhat=12 energy transfer, SHORT: ' >' + ihita", () => {
  const out = render(evt({ iwhat: 12, ihita: 5000 }), OFLG.SHORT);
  assert.match(out, /Excalibur /);
  assert.match(out, / >/);
  assert.match(out, /Buzzard/);
});

test("iwhat=12 energy transfer, LONG: 'transfers' + ihita + 'units of energy to the'", () => {
  const out = render(evt({ iwhat: 12, ihita: 5000 }), OFLG.LONG);
  assert.match(out, /transfers/);
  assert.match(out, /units of energy to the/);
});

// ── iwhat=13/14 tractor beam ─────────────────────────────────────────────────────────────

test("iwhat=13 tractor activated, MEDIUM: 'Trac. Beam on' (outh24)", () => {
  const out = render(evt({ iwhat: 13 }), OFLG.MEDIUM);
  assert.match(out, /Trac\. Beam on/);
});

test("iwhat=13 tractor activated, LONG: 'Tractor beam activated, Captain.' (outh23)", () => {
  const out = render(evt({ iwhat: 13 }), OFLG.LONG);
  assert.match(out, /Tractor beam activated, Captain\./);
});

test("iwhat=14 tractor released, MEDIUM: 'Trac. Beam off' (outh26)", () => {
  const out = render(evt({ iwhat: 14 }), OFLG.MEDIUM);
  assert.match(out, /Trac\. Beam off/);
});

test("iwhat=14 tractor released, LONG: 'Tractor beam broken, Captain.' (outh25)", () => {
  const out = render(evt({ iwhat: 14 }), OFLG.LONG);
  assert.match(out, /Tractor beam broken, Captain\./);
});

// ── iwhat=15 torpedo neutralized ─────────────────────────────────────────────────────────

test("iwhat=15 neutralized, MEDIUM: ' neutralized ' (outh28)", () => {
  const out = render(evt({ iwhat: 15, critdv: 2 }), OFLG.MEDIUM);
  assert.match(out, /T2 neutralized/);
});

test("iwhat=15 neutralized, LONG: ' neutralized by friendly object ' (outh27)", () => {
  const out = render(evt({ iwhat: 15, critdv: 2 }), OFLG.LONG);
  assert.match(out, /neutralized by friendly object/);
});

// ── Displacement glyphs (shjump != 0) ────────────────────────────────────────────────────

test("displacement, SHORT: '>' glyph", () => {
  const out = render(evt({ iwhat: 1, shjump: 1 }), OFLG.SHORT);
  assert.match(out, />/); // '>' before the hittee location
});

test("displacement, MEDIUM: '--' glyph", () => {
  const out = render(evt({ iwhat: 1, shjump: 1 }), OFLG.MEDIUM);
  assert.match(out, /--/);
});

test("displacement, LONG: 'displaced to ' (displc)", () => {
  const out = render(evt({ iwhat: 1, shjump: 1 }), OFLG.LONG);
  assert.match(out, /displaced to /);
});

// ── LONG-only 40-col wrap for ship/base hittees ──────────────────────────────────────────

test("LONG verbosity wraps to the next line when hcpos > 40 at the hittee transition", () => {
  const out = render(evt({ iwhat: 1 }), OFLG.LONG);
  // 'phaser hit on ' should be followed by a CRLF before the hittee name
  assert.match(out, /phaser hit on[\s\S]*\r\n[\s\S]*Buzzard/);
});

// ── Base critical-hit cascade (LONG only, hittee is base) ────────────────────────────────

test("LONG base critical-hit cascade: outh31/32/33 when base survives a critical hit", () => {
  const out = render(
    evt({
      iwhat: 2,
      dispto: DX.FBAS * 100 + 1,
      critdv: 1, // shields critically damaged
      critdm: 500,
      shstto: 0, // base shields knocked down
      klflg: 0,
    }),
    OFLG.LONG,
  );
  assert.match(out, /Critical hit on starbase, shields down!/);
  assert.match(out, /Starbase attempts to re-establish/);
});

test("LONG base destroyed cascade: outh34 + DESTROYED!! when klflg!=0 on a base", () => {
  const out = render(
    evt({
      iwhat: 2,
      dispto: DX.FBAS * 100 + 1,
      critdv: 1,
      critdm: 1000,
      shstto: 0,
      klflg: 2,
    }),
    OFLG.LONG,
  );
  assert.match(out, /BOOM!!/);
  assert.match(out, /DESTROYED!!/);
});
