/**
 * Session — the in-memory analog of the per-job FORTRAN `/lowseg/` COMMON block: the private
 * state of one connected player (Deliverable #5 §4, Deliverable #13 §6).
 *
 * Classification: Preserve exactly (semantics); representation Technology-forced. One
 * `Session` per telnet socket, the analog of one TOPS-10 job's private low segment.
 *
 * This increment defines the SHAPE and a factory only. The async read-eval loop, tokenizer,
 * and command handlers that consume these fields are later increments — and they carry the
 * load-bearing "no await in a critical section" invariant (Deliverable #13 §1), which is not
 * exercised by anything here (there is no async in the deterministic core).
 *
 * 1-based arrays mirror the FORTRAN (token slots 1..15, phaser banks 1..2), with index 0 a
 * filled placeholder.
 */
import { OFLG, COORD, TEAM, TOK } from "./constants.ts";
import type { Tenths } from "./fixed.ts";

/** 1..18 while playing; 0 in the lobby / when dead. */
export type PlayerIdx = number;

/**
 * Transport seam — the socket-backed I/O an in-game session reads/writes through. Declared
 * here so the core can reference it; the concrete telnet implementation is a later increment
 * (Deliverable #13 §8). The core never constructs one.
 */
export interface TelnetIO {
  /** Queue output text (flushed at the prompt/pacing boundary). */
  write(text: string): void;
  /** Await one command line (the only blocking read), with the `KCMDTM` idle timeout; null on timeout. */
  readCommandLine(timeoutMs: number): Promise<string | null>;
  /**
   * Pause the session for `ms` milliseconds. Used by weapon-cooldown gates (PHACON's
   * `call pause(phbank(bank) - etim)`) and the loop's between-prompts pacing. Production:
   * setTimeout-backed. ScriptedIo: no-op (records the duration for inspection); tests advance
   * a FakeClock manually.
   */
  pause(ms: number): Promise<void>;
  /** Negotiated terminal width (NAWS), default 80. */
  readonly terwid: number;
  /**
   * Callback fired when ^C arrives on the wire. Set by the runtime to flip `session.ccflg`;
   * the next read-eval boundary inspects ccflg and either injects QUIT (non-RED) or refuses
   * with `noquit` (RED alert) per source GETCMD lines 1228–1232.
   */
  onCtrlC: (() => void) | null;
  /** Drop the connection. */
  close(): void;
}

/** The parser working set — `ntok` + four parallel `(15)` arrays (Deliverable #5 §4.1). */
export interface TokenBuffers {
  ntok: number; // token count
  text: string[]; // tknlst — token text (1-based 1..15)
  val: number[]; // vallst — numeric value, else 0 (1-based)
  type: number[]; // typlst — TOK.* code (1-based)
  ptr: number[]; // ptrlst — char offset of each token in the line (1-based)
}

/** MAKHIT/GETHIT staging fields packed into a hit-queue entry (Deliverable #5 §4.2). */
export interface HitStaging {
  iwhat: number; // hit type 1..15
  ihita: Tenths; // hit size ×10
  vTo: number;
  hTo: number;
  vFrom: number;
  hFrom: number;
  critdv: number; // critically-damaged device #
  critdm: Tenths; // device damage ×10
  klflg: number; // swallowed-by-black-hole / kill flag
  dispfr: number; // DISP code of source
  dispto: number; // DISP code of receiver
  dbits: number; // recipient bitmask
  shcnto: number; // hittee shield condition
  shstto: Tenths; // hittee shield strength ×10
  shcnfr: number; // hitter shield condition
  shstfr: Tenths; // hitter shield strength ×10
  shjump: number; // object-displacement flag
}

/** A named ship group for TELL/targeting — `group(7,2)` (Deliverable #5 §4.3). */
export interface ShipGroup {
  name: string;
  mask: number; // member bitmask
}

export interface Session {
  io: TelnetIO; // socket-backed I/O seam

  // ── identity ────────────────────────────────────────────────────────────────────────────
  who: PlayerIdx; // 1..18 playing; 0 pre-game/dead
  team: 1 | 2; // 1 Fed / 2 Emp
  pasflg: boolean; // privileged/password flag
  player: boolean; // player-vs-Romulan flag for shared MOVE/CHECK
  shtype: number; // 1 normal, 10 trainer

  // ── parser / executor ───────────────────────────────────────────────────────────────────
  tokens: TokenBuffers;
  lineBuf: string; // the current input line being tokenized (the `linbuf` analog)
  bufptr: number; // scan position into the line buffer; -1 = read a fresh line

  // ── hit staging ─────────────────────────────────────────────────────────────────────────
  hit: HitStaging;

  /** Per-turn pending points (tpoint(8), 1-based), flushed into the score at end of turn. */
  tpoint: number[];

  // ── groups ──────────────────────────────────────────────────────────────────────────────
  groups: ShipGroup[]; // 1-based 1..7
  ngroup: number;

  // ── cooldown timestamps (wall-clock gated; Deliverable #13 §7.4) ─────────────────────────
  phbank: number[]; // phbank(2) — last phaser fire time per bank (1-based)
  tobank: number; // last torpedo fire time
  ptime: number; // pause (ms) before the NEXT prompt (pacing)

  // ── verbosity / coordinate flags ─────────────────────────────────────────────────────────
  oflg: -1 | 0 | 1; // output verbosity (OFLG)
  scnflg: number; // scan verbosity
  prtype: number; // prompt type (0 normal)
  icflg: -1 | 0 | 1; // coord input default (COORD)
  ocflg: -1 | 0 | 1; // coord output default (COORD)

  // ── control flags ────────────────────────────────────────────────────────────────────────
  ccflg: boolean; // ^C arrived
  rptflg: boolean; // command repeated ($/<ESC>)
  gagmsg: number; // per-player gag bitmask
  hungup: boolean; // line dropped → forced QUIT
  addrck: boolean; // address/APR fault (death-vs-quit stat)
  lkfail: boolean; // a lock request failed
  terwid: number; // terminal width (default 80)
  hcpos: number; // horizontal cursor position
  blank: number; // consecutive blank-line count
  inwait: boolean; // waiting for input
  ttytyp: number; // terminal-type index

  /** Per-session game-start monotonic timestamp — the `job(who, KJOBTM)` analog. 0 in lobby. */
  jobtm: number;

  /**
   * Stable per-connection key used for the kill-queue lookup (KQSRCH) when this session
   * reincarnates after a death (`server.runConnection` loop). The original used
   * `(ttynum, jobnum, ppn)`; the port uses a single opaque string. Default `""` matches
   * "never been killed in this game" semantics.
   */
  identity: string;

  /**
   * Captain name (SET NAME). Persisted in the honor-roll entry on `freeShip` and
   * re-applied on the next activation that matches this `identity`. Empty string means
   * "no name set yet"; the honor roll displays an empty entry as `<anon>`.
   */
  captain: string;
}

function freshTokens(): TokenBuffers {
  const slots = 15;
  return {
    ntok: 0,
    text: new Array<string>(slots + 1).fill(""),
    val: new Array<number>(slots + 1).fill(0),
    type: new Array<number>(slots + 1).fill(TOK.KNUL),
    ptr: new Array<number>(slots + 1).fill(0),
  };
}

function freshHit(): HitStaging {
  return {
    iwhat: 0,
    ihita: 0,
    vTo: 0,
    hTo: 0,
    vFrom: 0,
    hFrom: 0,
    critdv: 0,
    critdm: 0,
    klflg: 0,
    dispfr: 0,
    dispto: 0,
    dbits: 0,
    shcnto: 0,
    shstto: 0,
    shcnfr: 0,
    shstfr: 0,
    shjump: 0,
  };
}

/**
 * Create a fresh pre-game session bound to a transport. `who=0` (lobby), defaults match the
 * `/lowseg/` initial state: medium verbosity, both-coordinate display, line not read yet
 * (`bufptr=-1`), terminal width 80.
 */
export function createSession(io: TelnetIO): Session {
  const session: Session = sessionShape(io);
  // Wire IO transport hooks → session flags. The runtime loop consumes these at its boundaries.
  io.onCtrlC = () => { session.ccflg = true; };
  return session;
}

function sessionShape(io: TelnetIO): Session {
  return {
    io,
    who: 0,
    team: TEAM.FED,
    pasflg: false,
    player: true,
    shtype: 1,
    tokens: freshTokens(),
    lineBuf: "",
    bufptr: -1,
    hit: freshHit(),
    tpoint: new Array<number>(9).fill(0), // 1-based 1..8
    groups: new Array<ShipGroup>(8).fill({ name: "", mask: 0 }),
    ngroup: 0,
    phbank: [0, 0, 0], // 1-based 1..2
    tobank: 0,
    ptime: 0,
    oflg: OFLG.MEDIUM,
    scnflg: 0,
    prtype: 0,
    icflg: COORD.ABS, // input coords default to ABSOLUTE (Deliverable #4 §4)
    ocflg: COORD.BOTH,
    ccflg: false,
    rptflg: false,
    gagmsg: 0,
    hungup: false,
    addrck: false,
    lkfail: false,
    terwid: io.terwid || 80,
    hcpos: 0,
    blank: 0,
    inwait: false,
    ttytyp: 0,
    jobtm: 0,
    identity: "",
    captain: "",
  };
}
