/**
 * Regression tests for the TelnetSocketIO parser. The IAC state machine is the seam
 * where server-echo and protocol bytes share the same byte stream, so any path that
 * silently drops or misroutes a byte is a corruption risk.
 *
 * Pinned bug: when in "data" state, an incoming IAC (255) must transition to "iac"
 * state.  Previously the data-byte handler dropped 255 silently, so the entire
 * client-side negotiation was processed as data — byte 3 (the SGA option code)
 * was treated as ^C and fired the interrupt-bell, and byte 80 (the NAWS width-low
 * for a 80-column terminal) was treated as printable 'P' and echoed back.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, connect } from "node:net";
import type { AddressInfo } from "node:net";
import { TelnetSocketIO } from "../../src/telnet/io.ts";

/**
 * Spin up a one-shot loopback server that wraps the inbound socket in TelnetSocketIO
 * (so we can drive the real parser), feed it a scripted byte stream from the client
 * side, and capture everything the server sent back.
 */
function driveOnce(clientBytes: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const server = createServer((sock) => {
      // Just instantiating runs the negotiation + installs the data handler.
      // Hold onto the reference so it isn't GC'd mid-test.
      void new TelnetSocketIO(sock);
    });
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      const client = connect(port, "127.0.0.1");
      let buf = Buffer.alloc(0);
      client.on("data", (d) => {
        buf = Buffer.concat([buf, d]);
      });
      client.on("connect", () => {
        setTimeout(() => client.write(clientBytes), 10);
        setTimeout(() => client.end(), 250);
      });
      client.on("close", () => {
        server.close(() => resolve(buf));
      });
      client.on("error", reject);
    });
  });
}

test("IAC in data state transitions to iac state (no spurious BELL/echo from negotiation reply)", async () => {
  // Simulate a real telnet client replying to our WILL ECHO + WILL SGA + DO SGA + DO NAWS:
  //   DO ECHO, DO SGA, WILL SGA, WILL NAWS, then SB NAWS 0 80 0 24 IAC SE.
  // Byte 3 (SGA option code) and byte 80 (NAWS width-low) appear inside protocol
  // sequences and must NOT be interpreted as ^C or printable 'P' respectively.
  const reply = Buffer.from([
    255, 253, 1,                              // IAC DO ECHO
    255, 253, 3,                              // IAC DO SGA       ← byte 3 inside protocol
    255, 251, 3,                              // IAC WILL SGA     ← byte 3 inside protocol
    255, 251, 31,                             // IAC WILL NAWS
    255, 250, 31, 0, 80, 0, 24, 255, 240,     // IAC SB NAWS 0 80 0 24 IAC SE
  ]);
  const out = await driveOnce(reply);

  // Server-initiated negotiation comes first (we don't care about its contents here),
  // then there must be ZERO BEL (0x07) and ZERO 'P' (0x50) — those would be the
  // signature of the parser misrouting protocol bytes as data.
  assert.equal(out.includes(0x07), false, `unexpected BEL in: ${[...out].join(",")}`);
  assert.equal(out.includes(0x50), false, `unexpected 'P' (byte 80) in: ${[...out].join(",")}`);
});
