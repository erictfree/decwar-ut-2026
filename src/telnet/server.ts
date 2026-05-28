/**
 * Telnet server — one TCP connection becomes one Session that runs the lobby, then (on
 * activation) the in-game read-eval loop (Deliverable #8 §11.1, #10 §0, #13 §8). One socket =
 * one session = one player slot.
 */
import { createServer } from "node:net";
import type { Server, Socket } from "node:net";
import { TelnetSocketIO } from "./io.ts";
import { createSession } from "../core/session.ts";
import { runSession } from "../runtime/loop.ts";
import { runLobby } from "../lifecycle/lobby.ts";
import { freeShip } from "../lifecycle/activate.ts";
import { CRLF } from "../render/output.ts";
import type { GameState } from "../core/state.ts";
import type { Session } from "../core/session.ts";

const WELCOME = `${CRLF}DECWAR -- TypeScript port (Increment 3: lobby + universe + activation)${CRLF}`;

async function runConnection(state: GameState, session: Session): Promise<void> {
  try {
    // lobby → game → (on death) reincarnate via the lobby again
    for (;;) {
      const activated = await runLobby(state, session);
      if (!activated || session.hungup) break;
      const end = await runSession(state, session);
      // FREE: write the honor-roll entry (alive=`end !== "died"`), record the kill-queue
      // slot, clear the board cell, recycle the player slot, 5-min grace if last out.
      freeShip(state, session, end === "died");
      if (end !== "died" || session.hungup) break; // quit/hangup → leave; died → reincarnate
    }
  } catch {
    /* fall through to cleanup */
  }
  freeShip(state, session);
  session.io.close();
}

export function startServer(state: GameState, port: number): Server {
  const server = createServer((socket: Socket) => {
    const io = new TelnetSocketIO(socket);
    const session = createSession(io);
    // Kill-queue identity: stable for the life of this TCP connection (the source's
    // (ttynum, jobnum, ppn) tuple). A reincarnating player on the same socket gets the
    // same key; a brand-new connection gets a fresh one.
    session.identity = `${socket.remoteAddress ?? "?"}:${socket.remotePort ?? 0}`;
    io.onHangup = () => {
      session.hungup = true;
    };
    io.onCtrlC = () => {
      session.ccflg = true;
    };
    io.write(WELCOME);
    void runConnection(state, session);
  });
  server.listen(port);
  return server;
}
