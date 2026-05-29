/**
 * Concrete TelnetIO over a Node `net.Socket` — the technology-forced replacement for the
 * PDP-10's blocking TTY plus TOPS-10 monitor echo (Deliverable #8 §3/§5/§11, #13 §8).
 *
 * - Negotiation: WILL ECHO + WILL SUPPRESS-GO-AHEAD (server echoes input in character mode,
 *   the analog of monitor echo) + DO NAWS (source `terwid`, default 80).
 * - Line input with server echo, `^H`/DEL backspace editing, CR/LF/CRLF line termination.
 * - In-band `^C` (0x03) and `IAC IP` abort the current input line with 4 bells — a minimal
 *   stand-in; the full state-routed CCTRAP machine (TRAP/CLRBUF/RED-alert-block) is a later
 *   increment.
 * - Socket close/reset → `hungup` (forced QUIT), resolving any pending read with null.
 *
 * Classification: Technology-forced change (mechanism), Preserve semantically (behavior).
 */
import type { Socket } from "node:net";
import type { TelnetIO } from "../core/session.ts";

// Telnet protocol bytes (RFC 854 / NAWS RFC 1073).
const IAC = 255;
const DONT = 254;
const DO = 253;
const WONT = 252;
const WILL = 251;
const SB = 250;
const SE = 240;
const IP = 244; // interrupt process (often the client's ^C)
const OPT_ECHO = 1;
const OPT_SGA = 3;
const OPT_NAWS = 31;

const BELL4 = "\x07\x07\x07\x07";
const CRLF = "\r\n";

type ParseState = "data" | "iac" | "opt" | "sb" | "sbIac";

interface Waiter {
  resolve: (line: string | null) => void;
  timer: NodeJS.Timeout;
}

export class TelnetSocketIO implements TelnetIO {
  terwid = 80;
  /** Set by the server to mark the owning session hung up on socket close. */
  onHangup: (() => void) | null = null;
  /** ^C (in-band 0x03 or IAC IP) handler — set by the server to flip `session.ccflg`. */
  onCtrlC: (() => void) | null = null;

  readonly #socket: Socket;
  #state: ParseState = "data";
  #sbBuf: number[] = [];
  #lineBytes: number[] = [];
  #lastWasCR = false;
  #closed = false;

  readonly #lineQueue: string[] = [];
  #waiter: Waiter | null = null;

  constructor(socket: Socket) {
    this.#socket = socket;
    socket.on("data", (buf: Buffer) => this.#onData(buf));
    socket.on("close", () => this.#onClose());
    socket.on("error", () => this.#onClose());
    this.#negotiate();
  }

  #negotiate(): void {
    // Negotiate character mode at connection time.  WILL ECHO + WILL SGA tells the client
    // "I (server) echo input and won't send GO-AHEAD."  DO SGA asks the client to also
    // suppress GA on its end — this is the second half of the standard kludge-line-mode
    // → character-mode trigger that BSD `telnet` (macOS's default) needs to see before it
    // sends each typed byte immediately instead of buffering a line.  Without the
    // explicit DO SGA, BSD telnet may stay in line mode and render typed input on its
    // own line below the prompt.  DO NAWS asks for window-size updates (source `terwid`).
    this.#socket.write(
      Buffer.from([
        IAC, WILL, OPT_ECHO,
        IAC, WILL, OPT_SGA,
        IAC, DO, OPT_SGA,
        IAC, DO, OPT_NAWS,
      ]),
    );
  }

  write(text: string): void {
    if (!this.#closed) this.#socket.write(text);
  }

  close(): void {
    if (!this.#closed) this.#socket.end();
  }

  pause(ms: number): Promise<void> {
    if (this.#closed || ms <= 0) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  readCommandLine(timeoutMs: number): Promise<string | null> {
    if (this.#closed) return Promise.resolve(null);
    const queued = this.#lineQueue.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    return new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => {
        if (this.#waiter && this.#waiter.timer === timer) this.#waiter = null;
        resolve(null);
      }, timeoutMs);
      this.#waiter = { resolve, timer };
    });
  }

  #deliverLine(line: string): void {
    if (this.#waiter) {
      const w = this.#waiter;
      this.#waiter = null;
      clearTimeout(w.timer);
      w.resolve(line);
    } else {
      this.#lineQueue.push(line);
    }
  }

  #onClose(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.onHangup?.();
    if (this.#waiter) {
      const w = this.#waiter;
      this.#waiter = null;
      clearTimeout(w.timer);
      w.resolve(null);
    }
  }

  #onData(buf: Buffer): void {
    for (const byte of buf) {
      switch (this.#state) {
        case "data":
          if (byte === IAC) this.#state = "iac";
          else this.#onDataByte(byte);
          break;
        case "iac":
          this.#onIacByte(byte);
          break;
        case "opt":
          // option byte following WILL/WONT/DO/DONT — acknowledged implicitly; ignore.
          this.#state = "data";
          break;
        case "sb":
          if (byte === IAC) this.#state = "sbIac";
          else this.#sbBuf.push(byte);
          break;
        case "sbIac":
          if (byte === SE) {
            this.#endSubnegotiation();
            this.#state = "data";
          } else {
            this.#sbBuf.push(byte); // IAC IAC inside SB → literal
            this.#state = "sb";
          }
          break;
        default:
          this.#state = "data";
      }
    }
  }

  #onIacByte(byte: number): void {
    switch (byte) {
      case WILL:
      case WONT:
      case DO:
      case DONT:
        this.#state = "opt";
        break;
      case SB:
        this.#sbBuf = [];
        this.#state = "sb";
        break;
      case IP:
        this.#interrupt();
        this.#state = "data";
        break;
      default:
        this.#state = "data"; // GA and other 2-byte commands
    }
  }

  #endSubnegotiation(): void {
    if (this.#sbBuf[0] === OPT_NAWS && this.#sbBuf.length >= 5) {
      const w = ((this.#sbBuf[1] ?? 0) << 8) | (this.#sbBuf[2] ?? 0);
      if (w > 0) this.terwid = w;
    }
    this.#sbBuf = [];
  }

  #onDataByte(byte: number): void {
    // CR / LF line termination (handle CRLF and CR NUL by swallowing the pair-mate)
    if (byte === 13) {
      this.#lastWasCR = true;
      this.#endLine();
      return;
    }
    if (byte === 10) {
      if (this.#lastWasCR) {
        this.#lastWasCR = false; // LF after CR: already ended the line
        return;
      }
      this.#endLine();
      return;
    }
    if (byte === 0 && this.#lastWasCR) {
      this.#lastWasCR = false; // NUL after CR
      return;
    }
    this.#lastWasCR = false;

    if (byte === 3) {
      this.#interrupt(); // ^C
      return;
    }
    if (byte === 8 || byte === 127) {
      // backspace / DEL
      if (this.#lineBytes.length > 0) {
        this.#lineBytes.pop();
        this.write("\b \b");
      }
      return;
    }
    if (byte === 21) {
      // ^U — delete the whole line
      this.#lineBytes = [];
      this.write(CRLF);
      return;
    }
    if (byte >= 32 && byte < 127) {
      this.#lineBytes.push(byte);
      this.write(String.fromCharCode(byte)); // server echo
    }
    // other control bytes are ignored
  }

  #endLine(): void {
    const line = String.fromCharCode(...this.#lineBytes);
    this.#lineBytes = [];
    this.write(CRLF); // echo the newline
    this.#deliverLine(line);
  }

  #interrupt(): void {
    // In-band ^C (source CCTRAP per WARMAC.MAC inth.): clear the input buffer + ring the 4
    // bells (CLRBUF semantics), then fire onCtrlC so the loop can inspect `session.ccflg` at
    // the next read boundary.
    this.#lineBytes = [];
    this.write(BELL4 + CRLF);
    this.onCtrlC?.();
  }
}
