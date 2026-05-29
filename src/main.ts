// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 Eric Freeman and The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * Entry point — boot a single shared GameState and start the telnet server.
 *
 * Run with:
 *   node src/main.ts                                 (default port 2030)
 *   DECWAR_PORT=2031 node src/main.ts
 *   DECWAR_TEXT_DIR=./data DECWAR_HONOR_PATH=./decwar-honor.json node src/main.ts
 * then `telnet localhost <port>`.
 *
 * See `MANUAL.md` for the player's manual and `README.md` for the architecture overview.
 */
import { createInitialGameState } from "./core/state.ts";
import { startServer } from "./telnet/server.ts";
import { FileHonorStore } from "./persistence/honorRoll.ts";
import { FileTextStore } from "./persistence/textFiles.ts";

const port = Number(process.env["DECWAR_PORT"] ?? 2030);
const state = createInitialGameState();
// Persist the honor roll across server restarts (DECWAR.STA analog). Override the default
// path with DECWAR_HONOR_PATH; the default lives next to the running process.
state.honor = new FileHonorStore(process.env["DECWAR_HONOR_PATH"] ?? "./decwar-honor.json");
// Text store: HELP/NEWS load from $DECWAR_TEXT_DIR (default ./data), GRIPE appends to
// decwar.grp in that same directory. Missing files fall back to embedded text.
state.text = new FileTextStore(process.env["DECWAR_TEXT_DIR"] ?? "./data");
const server = startServer(state, port);

server.on("listening", () => {
  // eslint-disable-next-line no-console
  console.log(`DECWAR (decwar-ts) listening for telnet on port ${port}`);
});
