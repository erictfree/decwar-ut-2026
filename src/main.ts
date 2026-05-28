/**
 * Entry point — boot a single shared GameState and start the telnet server.
 *
 * Increment 2 is a vertical slice: connections auto-activate a ship (placeholder lobby) and
 * can run STATUS / QUIT through the faithful tokenizer + command dispatch. Run with:
 *   node src/main.ts            (default port 2030)
 *   DECWAR_PORT=2031 node src/main.ts
 * then `telnet localhost <port>`.
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
