/**
 * Tests for RADIO / TELL / OUTMSG (radio messaging). Pinned to DECWAR.FOR:2588–2612,
 * 3116–3167, 3958–4073; Deliverable #9 §4.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../../src/core/state.ts";
import { createSession } from "../../src/core/session.ts";
import { activate } from "../../src/lifecycle/activate.ts";
import { radio } from "../../src/commands/radio.ts";
import { tell } from "../../src/commands/tell.ts";
import { renderMsg } from "../../src/comms/outmsg.ts";
import { tokenize } from "../../src/parser/tokenizer.ts";
import { Rng } from "../../src/core/rng.ts";
import { DEV, KCRIT } from "../../src/core/constants.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";
import type { GameState } from "../../src/core/state.ts";
import type { Session } from "../../src/core/session.ts";

/** Two activated players: A = Excalibur (Fed #1), B = Buzzard (Emp #10). */
function twoPlayers(): { state: GameState; a: Session; b: Session } {
  const state = createInitialGameState(new Rng(1));
  const a = createSession(new ScriptedIo([]));
  activate(state, a); // who=1, Federation
  const b = createSession(new ScriptedIo([]));
  activate(state, b); // who=10, Empire
  return { state, a, b };
}

async function run(fn: (s: Session) => Promise<void>, session: Session, line: string): Promise<void> {
  session.lineBuf = line;
  session.tokens = tokenize(line, 0).tokens;
  await fn(session);
}

const out = (s: Session): string => (s.io as ScriptedIo).output;

test("RADIO ON/OFF toggles the shared nomsg bit", async () => {
  const { state, a } = twoPlayers();
  const bit = state.bits[1]!;
  await run((s) => radio(state, s), a, "RADIO OFF");
  assert.notEqual(state.nomsg & bit, 0);
  await run((s) => radio(state, s), a, "RADIO ON");
  assert.equal(state.nomsg & bit, 0);
});

test("RADIO GAG/UNGAG toggles the per-player gag; unknown ship is reported", async () => {
  const { state, a } = twoPlayers();
  const bitB = state.bits[10]!;
  await run((s) => radio(state, s), a, "RADIO GAG Buzzard");
  assert.notEqual(a.gagmsg & bitB, 0);
  await run((s) => radio(state, s), a, "RADIO UNGAG Buzzard");
  assert.equal(a.gagmsg & bitB, 0);
  await run((s) => radio(state, s), a, "RADIO GAG Nonesuch");
  assert.match(out(a), /Unknown ship name\./);
});

test("TELL delivers a message to a named ship", async () => {
  const { state, a, b } = twoPlayers();
  await run((s) => tell(state, s), a, "TELL Buzzard; hello there");
  assert.ok(state.bus.hasMsgs(10));
  const msgs = state.bus.drainMsgs(10);
  assert.equal(msgs[0]!.body, "hello there");
  const rendered = renderMsg(state, b, msgs[0]!);
  // Sender keeps the full ODISP name; recipients use the 2-char scan tags (source 2605).
  assert.match(rendered, /Message from Excalibur to {2}B\b/);
  assert.match(rendered, /hello there/);
});

test("TELL to a group reaches the living members of that side", async () => {
  const { state, b } = twoPlayers();
  await run((s) => tell(state, s), b, "TELL FEDERATION; incoming"); // Emp tells the Federation
  assert.ok(state.bus.hasMsgs(1)); // Excalibur (the only living Fed) gets it
});

test("OUTMSG renders multiple recipients as space-separated 2-char tags", async () => {
  // Construct a synthetic message addressed to slots 1, 2, 10 (E, F, B).
  const { state, a } = twoPlayers();
  const rendered = renderMsg(state, a, {
    dispfr: 200 + 10, // Buzzard sends
    recipients: (1 << 0) | (1 << 1) | (1 << 9), // slots 1, 2, 10
    body: "hi",
  });
  // MESS02 ends with "to ", and each tag is prefixed with one space → "to  E F B".
  assert.match(rendered, /Message from Buzzard to {2}E F B/);
});

test("addressing your own ship excludes you and sends nothing", async () => {
  const { state, a } = twoPlayers();
  await run((s) => tell(state, s), a, "TELL Excalibur; note to self");
  assert.match(out(a), /Self excluded from message\./);
  assert.match(out(a), /No message sent\./);
  assert.equal(state.bus.hasMsgs(1), false);
});

test("a radio-off recipient is dropped ('cannot raise')", async () => {
  const { state, a, b } = twoPlayers();
  await run((s) => radio(state, s), b, "RADIO OFF"); // Buzzard's radio off
  await run((s) => tell(state, s), a, "TELL Buzzard; hello");
  assert.match(out(a), /we cannot raise the Buzzard/);
  assert.equal(state.bus.hasMsgs(10), false);
});

test("a gagged sender is suppressed at the recipient's OUTMSG", async () => {
  const { state, a, b } = twoPlayers();
  await run((s) => radio(state, s), b, "RADIO GAG Excalibur"); // B gags A
  await run((s) => tell(state, s), a, "TELL Buzzard; spam");
  const msgs = state.bus.drainMsgs(10); // still queued
  assert.equal(msgs.length, 1);
  assert.equal(renderMsg(state, b, msgs[0]!), ""); // but suppressed for B
});

test("a damaged radio refuses to transmit", async () => {
  const { state, a } = twoPlayers();
  state.devices[1]![DEV.KDRAD] = KCRIT;
  await run((s) => tell(state, s), a, "TELL Buzzard; hi");
  assert.match(out(a), /Sub-Space radio damaged\./);
  assert.equal(state.bus.hasMsgs(10), false);
});
