// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 Eric Freeman and The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * GameState — the in-memory analog of the shared FORTRAN `/hiseg/` COMMON block: all world
 * state shared by every player (Deliverable #5 §3, Deliverable #13 §6).
 *
 * Classification: Preserve exactly (semantics); representation Technology-forced
 * (COMMON arrays → state objects). The original is one re-entrant high segment shared by N
 * jobs; the port collapses it to one in-memory store (Deliverable #13 §1/§2).
 *
 * INDEXING: arrays are **1-based** to mirror the FORTRAN (player slots 1..18, sides 1=Fed /
 * 2=Emp, categories 1..8, devices 1..9). Index 0 is an unused placeholder, filled so it is
 * never a sparse hole. This keeps ported handler code reading like the source
 * (`ships[who]`, `bits[who]`, `score[cat][who]`).
 *
 * OVERLOADED DOMAINS are preserved, not "cleaned up" (Deliverable #5 §11): `alive` is a
 * tri-state integer (playing / freed-dead / empty), `endflg` is multi-valued, `shieldCond`
 * is ±1, `docked` uses sign as a flag. They are typed to allow their full domains.
 */
import {
  KNPLAY,
  KNDEV,
  KNBASE,
  KNPLNT,
  KNPOIN,
  ENERGY_CAP,
  SHIELD_CAP,
  KNTORP_MAX,
  KLFSUP_MAX,
  COND,
  SHIELD,
  TEAM,
  KQLEN,
} from "./constants.ts";
import { Board } from "./board.ts";
import { Rng } from "./rng.ts";
import { MessageBus } from "../comms/messageBus.ts";
import { SystemClock } from "../runtime/clock.ts";
import type { Clock } from "../runtime/clock.ts";
import { InMemoryHonorStore } from "../persistence/honorRoll.ts";
import type { HonorStore } from "../persistence/honorRoll.ts";
import { InMemoryTextStore } from "../persistence/textFiles.ts";
import type { TextStore } from "../persistence/textFiles.ts";
import type { Tenths } from "./fixed.ts";

/** Ship condition: 1 green, 2 yellow, 3 red (COND). */
export type Condition = 1 | 2 | 3;
/** Shield condition: +1 up, −1 down (SHIELD); the sign multiplies KSSHPC for the display %. */
export type ShieldCond = 1 | -1;

/** `shpcon(p, 1..10)` — the central per-ship record (Deliverable #5 §3.1). */
export interface Ship {
  vPos: number; // KVPOS  board V (1..75); 0 until PLACEd
  hPos: number; // KHPOS  board H (1..75); 0 until PLACEd
  turns: number; // KNTURN turns/stardates taken
  condition: Condition; // KSPCON
  torps: number; // KNTORP photon torpedoes (0..10)
  shieldCond: ShieldCond; // KSHCON ±1
  lifeSupport: number; // KLFSUP reserve, stardates (0..5)
  energy: Tenths; // KSNRGY ×10 (0..50000)
  damage: Tenths; // KSDAM  ×10 (0..KENDAM)
  shieldPct: Tenths; // KSSHPC ×10 (0..1000 ⇒ 0.0–100.0%)
}

/** `base(b, *, side)` — starbase (Deliverable #5 §3.3). */
export interface Base {
  vPos: number;
  hPos: number;
  strength: Tenths; // ×10 (0..1000)
  scanMask: number; // which teams have scanned (LIST bitmask)
}

/** `locpln(i, *)` — planet (Deliverable #5 §3.5). */
export interface Planet {
  vPos: number;
  hPos: number;
  buildCount: number; // 0..5; 5 ⇒ converts to starbase
  scanMask: number; // LIST/scan bitmask OR'd with team
}

/** Romulan singleton state (Deliverable #5 §3.6). */
export interface Romulan {
  vPos: number;
  hPos: number;
  energy: Tenths; // erom ×10
  initialEnergy: Tenths; // eromo ×10
  exists: boolean; // rom
  moveCounter: number; // romcnt
  torpPause: number; // rtpaus
  phaserPause: number; // rppaus
  score: Tenths[]; // rsr(8) ×10, 1-based 1..8
  numSpawned: number; // numrom — cumulative spawn count (POINTS divisor)
  /** Which teams have scanned this Romulan (LIST "known" bitmask). Set by SCAN + by the
   * iwhat=11 detection broadcast on spawn. Cleared on DEADRO / next spawn. Source: the
   * generic `scnbts` argument to LSTUPD at DECWAR.FOR:1932. */
  scanMask: number;
}

/** The shared world (`/hiseg/`). */
export interface GameState {
  // ── per-ship (1..18) ──────────────────────────────────────────────────────────────────
  ships: Ship[]; // shpcon  (1-based)
  devices: Tenths[][]; // shpdam(p, 1..9) ×10 (1-based player → 1-based device)

  // ── bases / planets ─────────────────────────────────────────────────────────────────────
  bases: Base[][]; // base[side 1..2][index 1..10]
  nbase: number[]; // nbase[side] live base count (1-based side)
  planets: Planet[]; // locpln (1-based 1..nplnet; compacted on destroy)
  nplnet: number; // current planet count
  numcap: number[]; // numcap[side] planets captured (1-based side)

  // ── Romulan ─────────────────────────────────────────────────────────────────────────────
  romulan: Romulan;
  romopt: boolean; // Romulan enabled
  blhopt: boolean; // black holes enabled

  // ── board ───────────────────────────────────────────────────────────────────────────────
  board: Board;

  // ── shared RNG (the global `seed` in WARMAC); one stream per game ──────────────────────────
  rng: Rng;

  // ── time ────────────────────────────────────────────────────────────────────────────────
  /** Injectable clock seam (SystemClock in prod, FakeClock in tests). */
  clock: Clock;
  /** Game-start monotonic timestamp (the source's `tim0`). `etim(tim0) = clock.monotonic() - tim0`. */
  tim0: number;
  /**
   * Whether a live galaxy exists. Models the original's tim0/hitime/numply "is there a live
   * galaxy?" decision (SETUP.FOR:213–215): the first player to activate builds the universe,
   * later players join it. (The 5-minute `hitime` grace + rebuild is simplified for now.)
   */
  built: boolean;

  // ── identity / messaging ────────────────────────────────────────────────────────────────
  bits: number[]; // bits[i] = 2^(i-1) for ALL 18 (corrects source's 1–10-only init)
  nomsg: number; // shared radio-off recipient mask
  hitflg: number[]; // per-player pending-hit counter (1-based)
  msgflg: number[]; // per-player pending-message counter (1-based)
  bus: MessageBus; // the hit/message queues (the /hiseg/ queue analog)

  // ── scoring ─────────────────────────────────────────────────────────────────────────────
  score: Tenths[][]; // score[cat 1..8][player 1..18] ×10
  tmscor: Tenths[][]; // tmscor[side 1..2][cat 1..8] ×10
  tmturn: number[]; // tmturn[1..3] turns per side incl Romulan
  numshp: number[]; // numshp[side] ships used

  // ── lifecycle / scalars ─────────────────────────────────────────────────────────────────
  alive: number[]; // tri-state per player (see header); 1-based
  docked: number[]; // sign-as-flag (<0 docked); 1-based
  trstat: number[]; // tractor target slot (0 = none); 1-based
  numply: number; // active player count
  numsid: number[]; // numsid[side] active ships per side (1-based)
  dotime: number; // world-tick round counter
  gameno: number; // game number
  endflg: number; // universe-destroyed flag (multi-valued: 0 / truthy / -2)
  slwest: 1 | 2 | 3; // slowest-terminal pacing class (Compatibility option; default 1)
  hitime: number; // ms deadline to reinitialize /hiseg/ after last player leaves (5-min grace)
  version: number; // versio (=24)

  // ── kill queue (DECWAR.FOR:1094–1107 KQADD, 1325–1348 KQSRCH) ────────────────────────────
  /**
   * Records of recently-killed players so reincarnating the same connection can reuse their
   * previous ship (or trigger the defect / reassigned prompts). Capacity KQLEN=10. The source
   * uses (ttynum, jobnum, ppn) as identity; the port uses the per-Session `identity` string
   * (stable for a given TCP connection or for a test-injected key).
   */
  kilque: KillRecord[]; // 1-based, slots 1..KQLEN
  nkill: number; // count of populated slots
  kilndx: number; // round-robin write cursor (1-based)

  /**
   * Persisted honor-roll store (DECWAR.STA analog; WARMAC.MAC:5556 `updsta/shosta`).
   * Default: `InMemoryHonorStore` (no disk I/O — test seam). Production wires a
   * `FileHonorStore`; freeShip writes scores here, HONORROLL displays them, *Zap clears.
   */
  honor: HonorStore;

  /**
   * HELP/NEWS/GRIPE text store (DECWAR.HLP/NWS/GRP analog). Default: `InMemoryTextStore`
   * (embedded fallback strings). Production wires a `FileTextStore(DECWAR_TEXT_DIR)`.
   */
  text: TextStore;
}

export interface KillRecord {
  identity: string; // session identity at time of death (empty = unused slot)
  deathMs: number; // monotonic ms when freeShip ran
  team: 1 | 2;
  who: number; // 1..KNPLAY
}

// ── factory helpers ───────────────────────────────────────────────────────────────────────

/** Build a 1-based array of length n (indices 1..n), with index 0 a filled placeholder. */
function oneBased<T>(n: number, make: (i: number) => T): T[] {
  const a: T[] = new Array<T>(n + 1);
  for (let i = 0; i <= n; i++) a[i] = make(i);
  return a;
}

function zeros1(n: number): number[] {
  return oneBased(n, () => 0);
}

function zeroShip(): Ship {
  return {
    vPos: 0,
    hPos: 0,
    turns: 0,
    condition: COND.GREEN,
    torps: 0,
    shieldCond: SHIELD.UP,
    lifeSupport: 0,
    energy: 0,
    damage: 0,
    shieldPct: 0,
  };
}

function zeroBase(): Base {
  return { vPos: 0, hPos: 0, strength: 0, scanMask: 0 };
}

function zeroPlanet(): Planet {
  return { vPos: 0, hPos: 0, buildCount: 0, scanMask: 0 };
}

/**
 * The stat block a ship is given when a player activates it (SETUP.FOR:460–465; Deliverable
 * #5 §3.1): full energy, full shields up, full torps, full life support, GREEN, no damage.
 * Position is 0 here — PLACE assigns (V,H) at activation. Device damage is reset separately.
 */
export function newlyActivatedShip(): Ship {
  return {
    vPos: 0,
    hPos: 0,
    turns: 0,
    condition: COND.GREEN,
    torps: KNTORP_MAX, // 10
    shieldCond: SHIELD.UP, // +1
    lifeSupport: KLFSUP_MAX, // 5
    energy: ENERGY_CAP, // 50000 (=5000.0)
    damage: 0,
    shieldPct: SHIELD_CAP, // 1000 (=100.0%)
  };
}

/**
 * Produce a freshly-zeroed, seeded world — the analog of the first player zeroing `/hiseg/`
 * (`hfz..hlz`) plus the static, never-zeroed tables (`bits`, `versio`).
 *
 * Identity bits are seeded `bits[i] = 2^(i-1)` for **all 18** slots. The reconstruction
 * source DATA-initializes only 1–10 (`DECWAR.FOR:507`), which would leave slots 11–18 with
 * a zero identity bit and black out half the Empire (Deliverable #5 §6 Q1, #12 §2.1). The
 * 18-player port corrects this — a required correctness extension, not a game-design change.
 */
export function createInitialGameState(rng: Rng = new Rng(), clock: Clock = new SystemClock()): GameState {
  return {
    ships: oneBased(KNPLAY, zeroShip),
    devices: oneBased(KNPLAY, () => zeros1(KNDEV)),

    bases: oneBased(2, () => oneBased(KNBASE, zeroBase)),
    nbase: zeros1(2),
    planets: oneBased(KNPLNT, zeroPlanet),
    nplnet: 0,
    numcap: zeros1(2),

    romulan: {
      vPos: 0,
      hPos: 0,
      energy: 0,
      initialEnergy: 0,
      exists: false,
      moveCounter: 0,
      torpPause: 0,
      phaserPause: 0,
      score: zeros1(KNPOIN),
      numSpawned: 0,
      scanMask: 0,
    },
    romopt: true, // SETUP default: Romulan Empire involved (yes)
    blhopt: false, // SETUP default: black holes (no)

    board: new Board(),
    rng,
    clock,
    tim0: clock.monotonic(), // game-start timestamp; rebuilt on universe init too
    built: false,

    bits: oneBased(KNPLAY, (i) => (i === 0 ? 0 : 2 ** (i - 1))),
    nomsg: 0,
    hitflg: zeros1(KNPLAY),
    msgflg: zeros1(KNPLAY),
    bus: new MessageBus(),

    score: oneBased(KNPOIN, () => zeros1(KNPLAY)),
    tmscor: oneBased(2, () => zeros1(KNPOIN)),
    tmturn: zeros1(3),
    numshp: zeros1(2),

    alive: zeros1(KNPLAY),
    docked: zeros1(KNPLAY),
    trstat: zeros1(KNPLAY),
    numply: 0,
    numsid: zeros1(2),
    dotime: 0,
    gameno: 0,
    endflg: 0,
    slwest: 1,
    hitime: 0,
    version: 24,
    kilque: oneBased(KQLEN, () => ({ identity: "", deathMs: 0, team: TEAM.FED as 1, who: 0 })),
    nkill: 0,
    kilndx: 0,
    honor: new InMemoryHonorStore(),
    text: new InMemoryTextStore(),
  };
}
