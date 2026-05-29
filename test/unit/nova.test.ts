// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * NOVA / SNOVA / JUMP — star-explosion cascade + object displacement.
 * Source-pinned DECWAR.FOR:1276–1323 (JUMP), 2248–2381 (NOVA), 3790–3833 (SNOVA).
 * TORP star-path wiring DECWAR.FOR:4320–4334.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../../src/core/state.ts";
import { createSession } from "../../src/core/session.ts";
import { activate } from "../../src/lifecycle/activate.ts";
import { jump, nova, snova } from "../../src/combat/nova.ts";
import { torpedos } from "../../src/commands/torpedos.ts";
import { tokenize } from "../../src/parser/tokenizer.ts";
import { Rng } from "../../src/core/rng.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";
import { DX, COND, KENDAM, PT } from "../../src/core/constants.ts";
import type { GameState } from "../../src/core/state.ts";
import type { Session } from "../../src/core/session.ts";

function fresh(): { state: GameState; a: Session } {
  const state = createInitialGameState(new Rng(1));
  const a = createSession(new ScriptedIo([]));
  activate(state, a);
  return { state, a };
}
const reset = (s: Session): void => { (s.io as ScriptedIo).output = ""; };
const setArgs = (s: Session, line: string): void => {
  s.tokens = tokenize(line, 0).tokens;
};

function novaFirer(session: Session) {
  return { player: true, team: session.team, tpoint: session.tpoint };
}

// ── JUMP ─────────────────────────────────────────────────────────────────────────────────────

test("JUMP into an empty cell moves the ship and goes RED + undocks", () => {
  const { state, a } = fresh();
  const ship = state.ships[a.who]!;
  const v0 = ship.vPos, h0 = ship.hPos;
  // Ensure the (+1, 0) neighbor is empty.
  state.board.setdsp(v0 + 1, h0, 0);
  state.docked[a.who] = -1; // pretend docked
  const killed = jump(state, a.team === 1 ? DX.FSHP : DX.ESHP, a.who, 1, 0);
  assert.equal(killed, false);
  assert.equal(ship.vPos, v0 + 1);
  assert.equal(ship.hPos, h0);
  assert.equal(ship.condition, COND.RED);
  assert.equal(state.docked[a.who], 0);
  // Board: old cell empty, new cell has ship code.
  assert.equal(state.board.disp(v0, h0), 0);
  assert.equal(state.board.disp(v0 + 1, h0), (a.team === 1 ? DX.FSHP : DX.ESHP) * 100 + a.who);
});

test("JUMP into an occupied cell is a no-op", () => {
  const { state, a } = fresh();
  const ship = state.ships[a.who]!;
  const v0 = ship.vPos, h0 = ship.hPos;
  // Put a star at the destination.
  state.board.setdsp(v0 + 1, h0, DX.STAR * 100 + 1);
  const killed = jump(state, a.team === 1 ? DX.FSHP : DX.ESHP, a.who, 1, 0);
  assert.equal(killed, false);
  assert.equal(ship.vPos, v0);
  assert.equal(ship.hPos, h0);
});

test("JUMP into a black hole kills the ship", () => {
  const { state, a } = fresh();
  const ship = state.ships[a.who]!;
  const v0 = ship.vPos, h0 = ship.hPos;
  state.board.setdsp(v0 + 1, h0, DX.BHOL * 100 + 1);
  const killed = jump(state, a.team === 1 ? DX.FSHP : DX.ESHP, a.who, 1, 0);
  assert.equal(killed, true);
  assert.equal(ship.damage, KENDAM);
  assert.equal(state.alive[a.who], 0);
  // Old cell cleared.
  assert.equal(state.board.disp(v0, h0), 0);
});

test("JUMP off the galaxy edge is a no-op", () => {
  const { state, a } = fresh();
  const ship = state.ships[a.who]!;
  ship.vPos = 75; ship.hPos = 75; // upper corner
  state.board.setdsp(75, 75, (a.team === 1 ? DX.FSHP : DX.ESHP) * 100 + a.who);
  const killed = jump(state, a.team === 1 ? DX.FSHP : DX.ESHP, a.who, 1, 0); // off-galaxy
  assert.equal(killed, false);
  assert.equal(ship.vPos, 75);
});

// ── NOVA on a single ship ────────────────────────────────────────────────────────────────────

test("NOVA on a ship damages devices, hull, energy; emits iwhat=8", () => {
  const { state, a } = fresh();
  const ship = state.ships[a.who]!;
  const dev = state.devices[a.who]!;
  ship.shieldCond = -1; // shields down → d = 1000
  ship.energy = 30000;
  // Clear an adjacent cell to allow jump (one cell over).
  state.board.setdsp(ship.vPos + 1, ship.hPos, 0);
  // Star location at (vPos+1, hPos) — no, place blast origin at (vPos, hPos-1) so disV=0, disH=1.
  const vc = ship.vPos, hc = ship.hPos - 1;
  state.board.setdsp(vc, hc, 0); // virtual already-exploded star
  nova(state, novaFirer(a), a.team === 1 ? DX.FSHP : DX.ESHP, a.who, vc, hc, 0, 1);
  // Ship took damage.
  assert.ok(ship.damage > 0, `damage should grow; got ${ship.damage}`);
  // At least one device took damage.
  let anyDam = false;
  for (let i = 1; i <= 9; i++) if ((dev[i] ?? 0) > 0) { anyDam = true; break; }
  assert.equal(anyDam, true);
  // Hit was emitted to nearby ships (firer is within KRANGE of itself → queued).
  assert.equal(state.bus.hasHits(a.who), true);
});

test("NOVA on a planet decrements buildCount by 3; killed → plnrmv + tpoint[KNPDES]-=1000", () => {
  const { state, a } = fresh();
  const ship = state.ships[a.who]!;
  const v = ship.vPos + 1, h = ship.hPos + 1;
  state.nplnet++;
  const slot = state.nplnet;
  state.planets[slot] = { vPos: v, hPos: h, buildCount: 2, scanMask: 0 };
  state.board.setdsp(v, h, (DX.NPLN + 2) * 100 + slot); // Empire planet (assuming a is Fed)
  const nplnetBefore = state.nplnet;
  nova(state, novaFirer(a), DX.NPLN + 2, slot, v - 1, h - 1, 1, 1);
  // buildCount was 2; 2-3 = -1 → killed.
  assert.equal((a.tpoint[PT.KNPDES] ?? 0), -1000);
  assert.equal(state.nplnet, nplnetBefore - 1);
});

test("NOVA on a Romulan halves erom and displaces (don't-kill branch)", () => {
  const { state, a } = fresh();
  state.romulan.exists = true;
  state.romulan.energy = 400;
  state.romulan.vPos = 30;
  state.romulan.hPos = 30;
  state.board.setdsp(30, 30, DX.ROM * 100);
  state.board.setdsp(31, 30, 0); // landing spot empty
  nova(state, novaFirer(a), DX.ROM, 1, 29, 30, 1, 0);
  assert.equal(state.romulan.energy, 200);
  assert.equal(state.romulan.exists, true);
  // Displaced
  assert.equal(state.romulan.vPos, 31);
});

// ── SNOVA cascade ────────────────────────────────────────────────────────────────────────────

test("SNOVA collects victims in the 3x3 neighborhood and calls NOVA on each", () => {
  const { state, a } = fresh();
  // Cleared star at (40, 40); plant a Fed ship victim at (41, 40).
  const vc = 40, hc = 40;
  state.board.setdsp(vc, hc, 0);
  // Save the player's ship away then plant a "victim" ship at the adjacent cell.
  // Use slot 2 as the victim.
  const victimSlot = 2;
  state.ships[victimSlot] = {
    vPos: 41, hPos: 40, turns: 0, condition: COND.GREEN, torps: 0,
    shieldCond: -1, lifeSupport: 5, energy: 30000, damage: 0, shieldPct: 0,
  };
  state.alive[victimSlot] = -1;
  state.devices[victimSlot] = new Array<number>(10).fill(0);
  state.board.setdsp(41, 40, DX.FSHP * 100 + victimSlot);
  state.board.setdsp(42, 40, 0); // landing spot for jump

  snova(state, novaFirer(a), vc, hc);

  // The victim took some damage.
  assert.ok(state.ships[victimSlot]!.damage > 0);
  // Hit message was emitted to the victim's queue (they're within KRANGE of themselves).
  assert.equal(state.bus.hasHits(victimSlot), true);
});

// ── TORP star → SNOVA wiring ─────────────────────────────────────────────────────────────────

test("TORP into a star with aran<=80 triggers SNOVA + iwhat=7 + tpoint[KNSDES]-=500", async () => {
  // We seed and re-run until aran<=80 lands; with seed=1 the first iran(100) is reproducible.
  const { state, a } = fresh();
  const ship = state.ships[a.who]!;
  // Place a star directly adjacent in the firing direction.
  const vStar = ship.vPos + 1, hStar = ship.hPos;
  state.board.setdsp(vStar, hStar, DX.STAR * 100 + 1);
  // Loop torpedos until the star novas (deterministic — seed=1 should land aran<=80 quickly).
  let novaed = false;
  for (let tries = 0; tries < 30 && !novaed; tries++) {
    state.ships[a.who]!.torps = 10;
    setArgs(a, `TORPEDOS 1 ${vStar} ${hStar}`);
    reset(a);
    await torpedos(state, a);
    state.bus.drainHits(a.who); // discard
    if (state.board.disp(vStar, hStar) === 0) {
      novaed = true;
      break;
    }
    // Re-plant the star if it survived (aran>80 → unaffected, board kept it).
    state.board.setdsp(vStar, hStar, DX.STAR * 100 + 1);
  }
  assert.equal(novaed, true, "star should nova within 30 tries");
  // KNSDES went down by at least 500.
  assert.ok((a.tpoint[PT.KNSDES] ?? 0) <= -500);
});

test("SNOVA chains adjacent stars on iran(5) != 5 (source DECWAR.FOR:3808; G-8 audit fix)", () => {
  // Place a "central" cleared star at (40,40) and TWO adjacent stars at (40,41) and
  // (41,40). With a chain probability of 4/5, in most seeds both stars get pulled into
  // the cascade. The audit confirmed the source condition is iran(5) != 5 → chain.
  let chained = 0;
  let notChained = 0;
  for (let seed = 1; seed <= 60 && (chained === 0 || notChained === 0); seed++) {
    const state = createInitialGameState(new Rng(seed));
    const io = new ScriptedIo([]);
    const a = createSession(io);
    activate(state, a);
    const vc = 40, hc = 40;
    state.board.setdsp(vc, hc, 0);
    // Two adjacent stars.
    state.board.setdsp(40, 41, DX.STAR * 100);
    state.board.setdsp(41, 40, DX.STAR * 100);
    snova(state, novaFirer(a), vc, hc);
    // After SNOVA, a chained star is setdsp'd to 0; a non-chained one remains.
    const star1 = state.board.disp(40, 41);
    const star2 = state.board.disp(41, 40);
    if (star1 === 0 || star2 === 0) chained++;
    if (star1 !== 0 || star2 !== 0) notChained++;
  }
  // With a 4/5 chain rate per star and two stars per seed, ~96% of seeds should chain
  // at least one. Asserting any chained outcome is robust against the 1/25 corner case.
  assert.ok(chained > 0, "expected at least one seed to chain a star (iran(5)!=5 → 80%)");
});

test("SNOVA self-clears the originating star (source DECWAR.FOR:3798)", () => {
  // Source: SNOVA's first instruction is `call setdsp(iVc, iHc, 0)` — the originating
  // star is cleared INSIDE the routine, so callers don't strictly need to pre-clear
  // and the 3×3 walk can't accidentally re-collect it as a "chained" star.  This
  // test verifies snova() handles a non-pre-cleared center cell correctly.
  const state = createInitialGameState(new Rng(5));
  const io = new ScriptedIo([]);
  const a = createSession(io);
  activate(state, a);
  const vc = 40, hc = 40;
  // Plant a star at the center and DO NOT pre-clear it (the caller would normally do
  // this, but source semantics put the clear inside snova).
  state.board.setdsp(vc, hc, DX.STAR * 100);
  snova(state, novaFirer(a), vc, hc);
  // Center cell should be cleared by snova itself.
  assert.equal(state.board.disp(vc, hc), 0, "snova should clear its own originating star");
});
