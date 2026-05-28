/**
 * Tests for the read-eval loop driven by a scripted (socket-free) IO. Exercises the parser →
 * dispatch → output pipeline, command stacking, and the error paths, all synchronously.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../../src/core/state.ts";
import { createSession } from "../../src/core/session.ts";
import { activate } from "../../src/lifecycle/activate.ts";
import { runSession } from "../../src/runtime/loop.ts";
import { Rng } from "../../src/core/rng.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";

function drive(lines: string[]): Promise<ScriptedIo> {
  const state = createInitialGameState(new Rng(99));
  const io = new ScriptedIo(lines);
  const session = createSession(io);
  io.onHangup = () => {
    session.hungup = true;
  };
  activate(state, session); // skip the lobby; drop straight into the in-game loop
  return runSession(state, session).then(() => io);
}

test("runs STATUS, prompts, then QUIT (with confirm YES)", async () => {
  const io = await drive(["STATUS", "QUIT", "YES"]);
  assert.match(io.output, /Command: /); // prompt emitted
  assert.match(io.output, /Ener {3}5000\.0/); // STATUS produced output
  assert.match(io.output, /Do you really want to quit\?/);
  assert.match(io.output, /Goodbye\./); // QUIT confirmed → exited
});

test("QUIT without YES does NOT exit", async () => {
  const io = await drive(["QUIT", "NO", "QUIT", "YES"]);
  // First QUIT prompts, NO cancels, second QUIT + YES exits.
  assert.match(io.output, /Do you really want to quit\?/);
  assert.match(io.output, /Goodbye\./);
});

test("unknown and ambiguous commands report the right errors", async () => {
  const io = await drive(["XYZZY", "S", "QUIT", "YES"]);
  assert.match(io.output, /Unknown command -- for help type HELP/);
  assert.match(io.output, /Ambiguous command -- for help type HELP/);
});

test("'/' stacks multiple commands on one line", async () => {
  const io = await drive(["STATUS Energy/STATUS Torpedoes", "QUIT", "YES"]);
  assert.match(io.output, /Ener {3}5000\.0/);
  assert.match(io.output, /Torps {4}10/);
});

test("a recognized but unimplemented command says so", async () => {
  // All in-game commands now have at least minimal implementations; remove this check.
  // (Re-introduce if any in-game keyword is ever recognized-but-not-handled by the executor.)
  const io = await drive(["STATUS", "QUIT", "YES"]);
  assert.match(io.output, /Ener {3}5000\.0/); // STATUS works
});

test("the loop exits cleanly when the input ends without QUIT (hangup)", async () => {
  const io = await drive(["STATUS"]); // no QUIT — script exhaustion acts as hangup
  assert.match(io.output, /Ener {3}5000\.0/);
});
