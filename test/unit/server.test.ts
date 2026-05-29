// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 Eric Freeman and The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * End-to-end smoke test over a real telnet socket: connect, drive STATUS then QUIT, and
 * confirm the banner, STATUS output, and goodbye come back. Exercises TelnetSocketIO's
 * negotiation, server echo, line termination, and socket-close handling.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { connect } from "node:net";
import type { AddressInfo } from "node:net";
import { createInitialGameState } from "../../src/core/state.ts";
import { startServer } from "../../src/telnet/server.ts";

test("real socket: banner, STATUS, QUIT round-trip", async () => {
  const state = createInitialGameState();
  const server = startServer(state, 0); // ephemeral port
  await new Promise<void>((res) => server.once("listening", () => res()));
  const port = (server.address() as AddressInfo).port;

  const received = await new Promise<string>((resolve) => {
    let buf = "";
    const sock = connect(port, "127.0.0.1");
    const guard = setTimeout(() => sock.destroy(), 3000);
    guard.unref();
    sock.on("data", (d) => {
      buf += d.toString("latin1"); // keep telnet IAC bytes harmless; match text
    });
    sock.on("close", () => {
      clearTimeout(guard);
      resolve(buf);
    });
    sock.on("connect", () => {
      // STRTUP → blank, then SETUP cascade: setu02/setu04/setu05/setu18 take defaults,
      // setu14 needs a ship name (no default), then STATUS/QUIT/YES.
      setTimeout(() => sock.write("\r\n"), 50); // blank → activate
      setTimeout(() => sock.write("\r\n"), 100); // setu02 → Regular
      setTimeout(() => sock.write("\r\n"), 150); // setu04 → Romulan yes
      setTimeout(() => sock.write("\r\n"), 200); // setu05 → BH no
      setTimeout(() => sock.write("\r\n"), 250); // setu18 → default side (Fed)
      setTimeout(() => sock.write("Excalibur\r\n"), 300); // setu14 ship name
      setTimeout(() => sock.write("STATUS\r\n"), 400);
      setTimeout(() => sock.write("QUIT\r\n"), 500);
      setTimeout(() => sock.write("YES\r\n"), 600); // confirm
    });
  });

  server.close();

  assert.match(received, /Enter HELp, PREgame, or blank/); // strtup prompt
  assert.match(received, /commanding the Federation ship Excalibur\./); // first player → slot 1
  assert.match(received, /Command: /);
  assert.match(received, /Ener {3}5000\.0/);
  assert.match(received, /Goodbye\./);
});
