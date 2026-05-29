// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * DECWAR source-pinned constants.
 *
 * Authoritative source: the 18-player reconstruction tree
 *   `decwar source and associated files/utexas/utexas23-reconstruction/`
 * Primary files: `PARAM.FOR` (game constants) and `WARMAC.MAC` (assembly mirror).
 * Cross-references: analysis Deliverable #5 §3/§7 (data model) and #6 §16 (constants).
 *
 * Index constants below are **1-based**, exactly as the FORTRAN COMMON arrays index them
 * (e.g. `shpcon(p,KSNRGY)` with `KSNRGY=8`). The port keeps these 1-based so that ported
 * handler code reads like the original; arrays that are indexed by them are sized with an
 * unused slot 0. Named-field records (see `state.ts`) are used where the original indexed a
 * row by these constants but a struct is clearer and equivalent.
 *
 * Classification: Preserve exactly. Do NOT invent values — every constant here is quoted
 * from source.
 */

// ── Galaxy / population sizes (PARAM.FOR; Deliverable #6 §16) ────────────────────────────
export const KGALV = 75; // galaxy vertical bound (PARAM.FOR)
export const KGALH = 75; // galaxy horizontal bound (PARAM.FOR)
export const KNPLAY = 18; // max players, 9 per side (knplay=18 — the UT 18-player version)
export const KNBASE = 10; // starbases per side (PARAM.FOR)
export const KNDEV = 9; // device count: 8 named + tractor (PARAM.FOR; #5 §3.2)
export const KNPLNT = 60; // max planets (PARAM.FOR)
export const KNPOIN = 8; // scoring categories (PARAM.FOR; #5 §3.8)
export const KSID = 25; // board words per galaxy row = 75 cells / 3 cells-per-word (WARMAC; #5 §3.4)

// ── Combat / movement thresholds (PARAM.FOR; Deliverable #6 §16) ─────────────────────────
export const KCRIT = 3000; // device-damage "critical/disabled" threshold (×10 → 300.0)
export const KENDAM = 25000; // fatal ship-damage threshold (×10 → 2500.0)
export const KRANGE = 10; // max range of scan / phasers / torps (sectors, unscaled)

// ── Caps (enforced in DOCK/SHIELD; Deliverable #6 §16, #5 §7) ────────────────────────────
export const ENERGY_CAP = 50000; // ship energy cap (×10 → 5000.0)
export const SHIELD_CAP = 1000; // shield charge cap (×10 → 100.0%)
export const KNTORP_MAX = 10; // photon torpedo cap (unscaled)
export const KLFSUP_MAX = 5; // life-support reserve, stardates (unscaled)

// ── Energy/shield conversion (SHIELD, DECWAR.FOR:3763; #5 §7) ─────────────────────────────
export const SHIELD_ENERGY_RATIO = 25; // 25 internal energy units : 1 shield-charge unit

// ── Queues (WARMAC.MAC governs storage; #5 §5) ───────────────────────────────────────────
export const KNHSHP = 40; // hit-queue entries per ship
export const KNHIT = 400; // total hit-queue entries = KNHSHP * 10 (WARMAC governs over PARAM's 64)
export const KNMSG = 32; // max queued radio messages
export const KQLEN = 10; // kill-queue capacity (WARMAC.MAC:240)

/**
 * Privileged-mode password (PARAM.FOR:15). Exact match in `*Password` flips `session.pasflg`,
 * which unlocks `*Debug`, `*Zap`, `SET ROMOPT`, `SET ENDFLG`, `SET BHREMV`. WARMAC.MAC:222
 * has a different value ("S2K"); the FORTRAN PASWRD subroutine reads PARAM's, so that one
 * is authoritative for the in-game / pre-game *Password command. The source calls
 * `equal(tknlst(2), KPASS, 1)` then collapses prefix match (-1) to 0, so only EXACT matches
 * grant privilege; the equal() function itself is always case-insensitive on letters.
 */
export const KPASS = "*MINK";

// ── Timing (PARAM.FOR; #6 §16) ───────────────────────────────────────────────────────────
export const KCMDTM = 2000; // ms command-wait / idle message-delivery heartbeat

// ── Board cell sentinel (WARMAC.MAC:5315 DISP) ───────────────────────────────────────────
export const CELL_SENTINEL_RAW = 0o7777; // a 12-bit all-ones cell value (4095)
export const CELL_SENTINEL = -1; // ... reads back as -1 (`cain t0,7777 / seto t0`)

// ── Teams / sides (1=Fed, 2=Emp; sbits(0:2) NEU/FED/EMP, DECWAR.FOR BLOCK DATA:509) ──────
export const TEAM = { FED: 1, EMP: 2 } as const;
export const SIDE_BIT = { NEUTRAL: 0, FED: 1, EMP: 2 } as const; // sbits index (0-based array)

/**
 * Ship-condition codes — `shpcon(p,KSPCON)`. GREEN/YELLOW/RED (#5 §3.1).
 */
export const COND = { GREEN: 1, YELLOW: 2, RED: 3 } as const;

/**
 * Shield condition — `shpcon(p,KSHCON)`: +1 up, -1 down (the sign multiplies KSSHPC for
 * the displayed %, so the ±1 domain is load-bearing; do not collapse to bool). (#5 §3.1)
 */
export const SHIELD = { UP: 1, DOWN: -1 } as const;

/**
 * `shpcon(p, *)` second-index field codes (PARAM.FOR:46–56; Deliverable #5 §3.1). 1-based.
 * ×10-scaled fields: KSNRGY, KSDAM, KSSHPC. Others are plain integers.
 */
export const SHP = {
  KVPOS: 1, // vertical board coord (1..75)
  KHPOS: 2, // horizontal board coord (1..75)
  KNTURN: 3, // turns/stardates taken
  KSPCON: 4, // ship condition (COND)
  KNTORP: 5, // photon torpedoes remaining (0..10)
  KSHCON: 6, // shield condition (SHIELD, ±1)
  KLFSUP: 7, // life-support reserve (stardates, 0..5)
  KSNRGY: 8, // ship energy ×10 (0..50000)
  KSDAM: 9, // total ship damage ×10 (0..KENDAM)
  KSSHPC: 10, // shield charge ×10 (0..1000 ⇒ 0.0–100.0%)
} as const;

/**
 * `shpdam(p, *)` device indices (PARAM.FOR:71–78; Deliverable #5 §3.2). 1-based, ×10 damage.
 * Devices 1–8 are named in PARAM; index 9 is the tractor beam (`device(9)`='TR'), which has
 * no PARAM constant — named KDTRAC here. Whether shpdam(*,9) is ever written is an open
 * question (#5 §3.2); the slot is preserved either way.
 */
export const DEV = {
  KDSHLD: 1, // deflector shields
  KDWARP: 2, // warp engines
  KDIMP: 3, // impulse engines
  KDLIFE: 4, // life support
  KDTORP: 5, // photon torpedo tubes
  KDPHAS: 6, // phasers
  KDCOMP: 7, // computer
  KDRAD: 8, // subspace radio
  KDTRAC: 9, // tractor beam (no PARAM constant; device(9)='TR')
} as const;

/**
 * Object class codes used on the board as `class*100 + index` (WARMAC.MAC:359–371;
 * Deliverable #5 §3.4).
 */
export const DX = {
  MPTY: 0, // empty space
  FSHP: 1, // federation ship
  ESHP: 2, // empire ship
  FBAS: 3, // federation base
  EBAS: 4, // empire base
  ROM: 5, // romulan ship
  NPLN: 6, // neutral planet
  FPLN: 7, // federation planet
  EPLN: 8, // empire planet
  STAR: 9, // star
  BHOL: 10, // black hole
} as const;

/**
 * Scoring categories — `score(KNPOIN,*)`, `tpoint`, `tmscor`, `rsr` (PARAM.FOR:60–67;
 * Deliverable #5 §3.8). 1-based, all ×10.
 */
export const PT = {
  KPEDAM: 1, // enemy damage inflicted
  KPEKIL: 2, // enemies killed
  KPBDAM: 3, // base damage inflicted
  KPPCAP: 4, // planets captured
  KPBBAS: 5, // bases built
  KPRKIL: 6, // Romulans killed
  KNSDES: 7, // stars destroyed
  KNPDES: 8, // planets destroyed
} as const;

/**
 * Token type codes — `typlst` (PARAM.FOR:38–42; Deliverable #5 §4.1). Used by the parser
 * (later increment); defined here so the canonical values live with the other constants.
 */
export const TOK = { KEOL: -1, KNUL: 0, KINT: 1, KFLT: 2, KALF: 3 } as const;

/**
 * Output verbosity — `oflg` (Deliverable #5 §4.3): SHORT/-1 MEDIUM/0 LONG/1. Drives the
 * OFLT fraction suppression (short omits the decimal).
 */
export const OFLG = { SHORT: -1, MEDIUM: 0, LONG: 1 } as const;

/**
 * Coordinate input/output mode — `icflg`/`ocflg` (Deliverable #5 §4.3):
 * RELATIVE/-1 BOTH/0 ABSOLUTE/1.
 */
export const COORD = { REL: -1, BOTH: 0, ABS: 1 } as const;
