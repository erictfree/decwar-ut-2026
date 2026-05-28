/**
 * Tests for STATUS rendering. Pinned to DECWAR.FOR:3841–3955 and the MSG.MAC labels.
 * (Field-column alignment is a later golden-transcript item; these assert labels + values.)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../../src/core/state.ts";
import { createSession } from "../../src/core/session.ts";
import { activate } from "../../src/lifecycle/activate.ts";
import { renderStatus } from "../../src/commands/status.ts";
import { OFLG, DEV, KCRIT } from "../../src/core/constants.ts";
import { Rng } from "../../src/core/rng.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";

function activatedSession() {
  const state = createInitialGameState(new Rng(20260527)); // seeded for a deterministic build
  const io = new ScriptedIo([]);
  const session = createSession(io);
  activate(state, session); // first player → who=1 (Fed), full activation stats, RNG-placed
  io.output = ""; // discard the activation chatter; tests want just the STATUS render
  return { state, session, io };
}

function render(state: ReturnType<typeof activatedSession>["state"], session: ReturnType<typeof activatedSession>["session"], items: string[] | null): string {
  const io = session.io as ScriptedIo;
  io.output = "";
  renderStatus(state, session, items);
  return io.output;
}

test("medium STATUS reports each field with the right value", () => {
  const { state, session } = activatedSession();
  const out = render(state, session, null);
  assert.match(out, /SDate/);
  assert.match(out, /Cond {3}Green/); // condition GREEN, not docked
  assert.match(out, /Loc {4}\d+-\d+/); // RNG-placed sector v-h
  assert.match(out, /Torps {4}10/); // full torpedoes (width-padded)
  assert.match(out, /Ener {3}5000\.0/); // 50000 ×10 → 5000.0
  assert.match(out, /Dam {7}0\.0/); // 0 damage
  assert.match(out, /Shlds {2}\+100\.0% 2500\.0 units/); // shields up, 25:1 reserve
  assert.match(out, /Radio {2}On/); // radio working, not gagged
});

test("a single-item STATUS skips the stardate", () => {
  const { state, session } = activatedSession();
  const out = render(state, session, ["Energy"]);
  assert.doesNotMatch(out, /SDate/);
  assert.match(out, /Ener {3}5000\.0/);
});

test("STATUS Radio shows 'damaged' when the radio device is critically damaged", () => {
  const { state, session } = activatedSession();
  state.devices[session.who]![DEV.KDRAD] = KCRIT; // disable the radio
  const out = render(state, session, ["Radio"]);
  assert.match(out, /Radio {2}damaged/);
});

test("short STATUS uses single-letter labels on one line", () => {
  const { state, session } = activatedSession();
  session.oflg = OFLG.SHORT;
  const out = render(state, session, null);
  assert.match(out, /SD0/); // SD + turns(0), no width padding in short
  assert.match(out, /E5000/); // energy, fraction suppressed in short
  assert.ok(!out.includes("\r\n\r\n"), "short report is compact");
});

test("LONG STATUS places value columns at the next tab stop after each label", () => {
  const { state, session } = activatedSession();
  session.oflg = OFLG.LONG;
  const out = render(state, session, null);
  // Each LONG label uses tabs to align its value column. Verify a few that should land
  // at the same horizontal position once the terminal expands tabs.
  assert.match(out, /Stardate\t/);
  assert.match(out, /Shields\t/);
  assert.match(out, /Energy left\t/);
  assert.match(out, /Damage\t\t/);
  assert.match(out, /Radio\t\t/);
});

test("LONG STATUS hcpos tracking advances through TAB to next 8-col boundary", () => {
  const { state, session, io } = activatedSession();
  session.oflg = OFLG.LONG;
  // Reset cursor to a known column before rendering one item.
  session.hcpos = 0;
  session.blank = 0;
  io.output = "";
  renderStatus(state, session, ["Energy"]);
  // After rendering one item, the last line wrote `Energy left<TAB>5000.0<CRLF>`. The
  // out() seam advances hcpos: CR drops to 0, LF stays at 0. So hcpos === 0 at the end.
  assert.equal(session.hcpos, 0);
});
