/**
 * OUTHIT — render a HitEvent for the recipient's display.
 *
 * Source: `DECWAR.FOR:2393–2585` (subroutine OUTHIT), with all 15 iwhat codes:
 *   1 phaser hit, 2 torpedo hit, 3 torpedo deflection, 4 torpedo miss, 5 torpedo into
 *   black hole, 6 star unaffected by torpedo, 7 star goes nova, 8 star damages someone,
 *   9 galaxy-wide base under attack, 10 base destroyed, 11 Romulan detected, 12
 *   ship-to-ship energy transfer, 13 tractor activated, 14 tractor released, 15 torpedo
 *   neutralized by friendly object.
 *
 * Classification: Preserve exactly (product text + three-way `oflg` branching). The output
 * routes through `out(session, …)` so cursor tracking (`session.hcpos`) drives the
 * source's 40-column wrap at the hittee transition (`DECWAR.FOR:2466`).
 *
 * Numeric values are passed in their ×10 (Tenths) form for `oflt`/`osflt`; coordinate
 * locations route through `prloc` using the recipient ship as the relative origin.
 */
import { CRLF, out, space, crlf } from "../render/output.ts";
import { oflt, osflt, odec, prloc } from "../render/format.ts";
import {
  // strings used in the rewrite
  OUTH01, OUTH02, OUTH03, OUTH04, OUTH05, OUTH06, OUTH07, OUTH08, OUTH09, OUTH10,
  OUTH12, OUTH13, OUTH14, OUTH15, OUTH16, OUTH17, OUTH18, OUTH19, OUTH20, OUTH21,
  OUTH22, OUTH23, OUTH24, OUTH25, OUTH26, OUTH27, OUTH28, OUTH29, OUTH30,
  OUTH31, OUTH32, OUTH33, OUTH34, DISPLC,
  STAR02, TORMIS, DESTRY, UNITS1,
  OBJ_NAMES, SHIP_NAMES, DEVICE_NAMES,
} from "../render/strings.ts";
import { DX, OFLG } from "../core/constants.ts";
import type { HitEvent } from "./messageBus.ts";
import type { Session } from "../core/session.ts";
import type { GameState } from "../core/state.ts";

/**
 * Three-way `oflg` picker, mirroring the source's `if (oflg) X, Y, Z`:
 *   X = short branch (oflg < 0), Y = medium branch (oflg == 0), Z = long branch (oflg > 0).
 */
function pick<T>(session: Session, short: T, medium: T, long: T): T {
  if (session.oflg === OFLG.SHORT) return short;
  if (session.oflg === OFLG.LONG) return long;
  return medium;
}

/** Render an object's display name from its `class*100 + index` DISP code (ODISP equivalent). */
export function objName(code: number): string {
  const cls = Math.trunc(code / 100);
  const idx = code % 100;
  if (cls === DX.FSHP || cls === DX.ESHP) return SHIP_NAMES[idx] ?? `ship ${idx}`;
  return OBJ_NAMES[cls] ?? "object";
}

/** odisp analog: ship gets full name; everything else gets the class label. */
function odisp(session: Session, code: number, trailingSpace: 0 | 1): void {
  out(session, objName(code));
  if (trailingSpace !== 0) space(session);
}

/** odev analog — device name lookup with a trailing space (source pattern). */
function odev(session: Session, dev: number): void {
  out(session, DEVICE_NAMES[dev] ?? "?");
}

function isShipBase(cls: number): boolean {
  return cls === DX.FSHP || cls === DX.ESHP || cls === DX.FBAS || cls === DX.EBAS;
}

function isBase(cls: number): boolean {
  return cls === DX.FBAS || cls === DX.EBAS;
}

function isShipBaseOrRom(cls: number): boolean {
  return isShipBase(cls) || cls === DX.ROM;
}

function isPlanet(cls: number): boolean {
  return cls === DX.NPLN || cls === DX.FPLN || cls === DX.EPLN;
}

/**
 * Render the hitter's name, shield strength (planets only — parens in LONG), and location
 * + shield-% suffix (ship/base only). Source DECWAR.FOR:2407–2422 (the `200` entry shared
 * by iwhat 1/2/3/6/7/8/15).
 */
function renderHitter(state: GameState, session: Session, e: HitEvent): void {
  const nplcf = Math.trunc(e.dispfr / 100);
  const recip = state.ships[session.who];
  const vMe = recip?.vPos ?? 0;
  const hMe = recip?.hPos ?? 0;

  odisp(session, e.dispfr, 0);

  // Source 2409–2413: planet hitter with shield strength gets a numeric shield-strength
  // print; LONG mode wraps it in parens.
  if (isPlanet(nplcf) && e.shstfr !== 0) {
    if (session.oflg === OFLG.LONG) out(session, "(");
    out(session, odec(e.shstfr, 0));
    if (session.oflg === OFLG.LONG) out(session, ")");
  }
  space(session);

  // Source 2415: hitter's location via PRLOC.
  out(session, prloc(e.vfrom, e.hfrom, 0, 0, session.ocflg, session.oflg, vMe, hMe));

  // Source 2416–2421: not-SHORT and ship/base/planet hitter (nplcf < DXROM) gets a comma
  // + shield-% suffix. SHORT skips the comma, LONG keeps it.
  if (session.oflg !== OFLG.SHORT && nplcf < DX.ROM) {
    out(session, ",");
  }
  if (nplcf < DX.ROM) {
    space(session);
    out(session, osflt(e.shcnfr * e.shstfr, 0, session.oflg === OFLG.SHORT));
    if (session.oflg !== OFLG.SHORT) out(session, "%");
  }
  space(session);
}

/**
 * Render the hittee (after iwhat=1/2/3/8 fall through to the source's `2500` entry).
 * Source DECWAR.FOR:2464–2510: SHORT pads with two spaces; MEDIUM/LONG wrap to next line
 * if hcpos > 40 and the hittee is ship/base/Romulan (the source's display-width sanity
 * check, line 2466).
 */
function renderHittee(state: GameState, session: Session, e: HitEvent, withSeparator = true): void {
  const nplct = Math.trunc(e.dispto / 100);
  const recip = state.ships[session.who];
  const vMe = recip?.vPos ?? 0;
  const hMe = recip?.hPos ?? 0;
  const isShort = session.oflg === OFLG.SHORT;

  if (withSeparator) {
    if (isShort) {
      out(session, "  "); // source 2465: out2c('  ')
    } else if (nplct < DX.ROM && session.hcpos > 40) {
      crlf(session); // source 2466: line wrap at column 40 for ship/base hittees
    }
  }

  odisp(session, e.dispto, 0);

  // Planet hittee with shield strength — same paren rule as the hitter (source 2470–2472).
  if (isPlanet(nplct) && e.shstto !== 0) {
    if (session.oflg === OFLG.LONG) out(session, "(");
    out(session, odec(e.shstto, 0));
    if (session.oflg === OFLG.LONG) out(session, ")");
  }
  space(session);

  // Displacement glyph or @-prefix for the location (source 2474–2480).
  if (e.shjump !== 0) {
    // SHORT '>', MEDIUM '--', LONG outh displc + jump to 3400 (no '>')
    if (isShort) out(session, ">");
    else if (session.oflg === OFLG.LONG) out(session, DISPLC);
    else out(session, "--");
  } else if (!isShort) {
    out(session, "@");
  }

  // Source 2481: hittee location ALWAYS in SHORT format, regardless of session.oflg.
  out(session, prloc(e.vto, e.hto, 0, 0, session.ocflg, OFLG.SHORT, vMe, hMe));

  // Source 2482–2486: ship/base/Romulan hittees that aren't dead get their shield-% suffix.
  if (nplct < DX.ROM && e.klflg === 0) {
    if (!isShort) out(session, ",");
    space(session);
    out(session, osflt(e.shcnto * e.shstto, 0, isShort));
    if (!isShort) out(session, "%");
  }

  // Source 2488–2497: if hittee is the recipient + a device was critically damaged, render
  // the device-damage line ("; <device> <gap> <units>"). LONG appends "units1" suffix.
  const myDisp = session.who + session.team * 100;
  if (e.dispto === myDisp && e.critdv !== 0) {
    out(session, "; ");
    odev(session, e.critdv);
    if (isShort) space(session);
    else if (session.oflg === OFLG.LONG) out(session, OUTH07);
    else out(session, OUTH08);
    out(session, oflt(e.critdm, 0, isShort));
    if (session.oflg === OFLG.LONG) out(session, UNITS1);
  }

  // Source 2499–2510: LONG-only base critical-hit cascade.
  if (session.oflg === OFLG.LONG && isBase(nplct)) {
    if (e.klflg !== 0 || e.critdm !== 0) {
      out(session, "  ");
      if (e.klflg !== 0) crlf(session);
      out(session, OUTH31 + CRLF);
      // Source 2505 says `if (oflg .ne. LONG) goto 4100` — but we're inside the LONG branch
      // already, so the rest always runs.
      out(session, OUTH32 + CRLF);
      if (e.klflg === 0) out(session, OUTH33 + CRLF);
      else out(session, OUTH34); // no CRLF; followed by destroyed-line below
    }
  }

  // Source 2512–2521: hittee destroyed.
  if (e.klflg !== 0) {
    space(session);
    if (session.oflg === OFLG.LONG) crlf(session);
    if (e.klflg === 2) {
      // ship → black hole (klflg=2)
      odisp(session, e.dispto, 0);
      out(session, pick(session, OUTH10, OUTH10, OUTH09) + CRLF);
    }
    odisp(session, e.dispto, 1);
    out(session, DESTRY + CRLF);
  } else {
    crlf(session);
  }
}

/**
 * Render one hit event for the recipient `session` via `out()`. Cursor tracking
 * (`session.hcpos`) drives the 40-col line wrap inside `renderHittee`. Returns nothing —
 * all writes go through the IO seam.
 */
export function renderHit(state: GameState, session: Session, e: HitEvent): void {
  const recip = state.ships[session.who];
  const vMe = recip?.vPos ?? 0;
  const hMe = recip?.hPos ?? 0;
  const isShort = session.oflg === OFLG.SHORT;
  const long = session.oflg === OFLG.LONG;

  // Source 2400: LONG verbosity gets a leading CRLF to space hits apart.
  if (long) crlf(session);

  const nplcf = Math.trunc(e.dispfr / 100);
  const nplct = Math.trunc(e.dispto / 100);

  switch (e.iwhat) {
    // ── iwhats 1/2/3/6/7/8/15: share the hitter header (source `200` entry) ────────────
    case 1:
    case 2:
    case 3:
    case 6:
    case 7:
    case 8: {
      renderHitter(state, session, e);

      if (e.iwhat === 7) {
        // Star goes nova (iwhat=7) — source 2423–2429.
        out(session, pick(session, "N", "N", OUTH01));
        crlf(session);
        return;
      }
      if (e.iwhat === 6) {
        // Star unaffected (iwhat=6) — source 2430–2436.
        out(session, pick(session, "U", "U", STAR02));
        crlf(session);
        return;
      }
      if (e.iwhat === 3) {
        // Torpedo deflected by shields (iwhat=3) — source 2437–2441.
        // SHORT case: source jumps to 2500 directly (`if (oflg) 1500, 1300, 1400`) → no verb.
        if (!isShort) out(session, long ? OUTH30 : OUTH29);
        renderHittee(state, session, e);
        return;
      }
      // iwhat 1/2/8: someone-damaged path (source 1500+).
      if (long) out(session, OUTH02); // 'makes'
      space(session);

      // Source 2445–2453: if hittee is NOT (Romulan/planet hit by star, i.e. iwhat==8 with
      // a Romulan/planet hittee), render the hit size + ' unit '/'N' verb.
      const hitteeIsRomOrPlanet = nplct > DX.ROM;
      if (!hitteeIsRomOrPlanet || e.iwhat === 8) {
        if (!hitteeIsRomOrPlanet) {
          out(session, oflt(e.ihita, 0, isShort));
          if (!isShort) out(session, OUTH03);
        }
        if (e.iwhat === 8) {
          // Star damages someone (iwhat=8) — source 2451–2453: 'N' / 'N' / outh04.
          out(session, pick(session, "N", "N", OUTH04));
        }
      }
      if (e.iwhat === 1) {
        // Phaser hit verb — source 2460–2462: 'P' / 'P' / outh06.
        out(session, pick(session, "P", "P", OUTH06));
      } else if (e.iwhat === 2) {
        // Torpedo hit verb — source 2456–2458: 'T' / 'T' / outh05.
        out(session, pick(session, "T", "T", OUTH05));
      }
      renderHittee(state, session, e);
      return;
    }

    // ── iwhats 4/5/15: torpedo non-hit (miss / black hole / neutralized) ─────────────
    case 4:
    case 5:
    case 15: {
      // Source 4600: 'T' (short/medium) / tormis (long) + torp number.
      out(session, pick(session, "T", "T", TORMIS));
      out(session, odec(e.critdv, 0));
      if (e.iwhat === 4) {
        out(session, pick(session, OUTH13, OUTH13, OUTH12));
      } else if (e.iwhat === 5) {
        out(session, pick(session, OUTH15, OUTH15, OUTH14));
      } else {
        // iwhat === 15
        out(session, pick(session, OUTH28, OUTH28, OUTH27));
      }
      // Source 5300: prloc with prcflg=1 (emits trailing CRLF) at the recipient's oflg.
      out(session, prloc(e.vto, e.hto, 1, 0, session.ocflg, session.oflg, vMe, hMe));
      return;
    }

    // ── iwhats 9/10: galaxy-wide base alert / destroyed ───────────────────────────────
    case 9:
    case 10: {
      // Source 6000–6700. Radio/gag gating happens in messageBus.makeHit before queuing,
      // so by this point we just render.
      odisp(session, e.dispto, 1);
      out(session, prloc(e.vto, e.hto, 0, 0, session.ocflg, session.oflg, vMe, hMe));
      if (e.iwhat === 9) {
        // Base under attack: ' A' / outh17 / outh16 + CRLF.
        if (isShort) { out(session, " A"); crlf(session); }
        else out(session, (long ? OUTH16 : OUTH17) + CRLF);
      } else {
        // Base destroyed: ' D' / outh19 / outh18 + CRLF.
        if (isShort) { out(session, " D"); crlf(session); }
        else out(session, (long ? OUTH18 : OUTH19) + CRLF);
      }
      return;
    }

    // ── iwhat 11: Romulan detected at ... ─────────────────────────────────────────────
    case 11: {
      odisp(session, e.dispfr, 1);
      if (long) out(session, OUTH20);
      space(session);
      out(session, prloc(e.vfrom, e.hfrom, 1, 0, session.ocflg, session.oflg, vMe, hMe));
      return;
    }

    // ── iwhat 12: ship-to-ship energy transfer ────────────────────────────────────────
    case 12: {
      odisp(session, e.dispfr, 1);
      if (long) out(session, OUTH21);
      out(session, oflt(e.ihita, 0, isShort));
      if (isShort) out(session, " >");
      else out(session, OUTH22);
      space(session);
      odisp(session, e.dispto, 1);
      crlf(session);
      return;
    }

    // ── iwhats 13/14: tractor beam ────────────────────────────────────────────────────
    case 13: {
      // 'Trac. Beam on' / outh23 — source 7300–7500.
      out(session, (long ? OUTH23 : OUTH24) + CRLF);
      return;
    }
    case 14: {
      // 'Trac. Beam off' / outh25 — source 7600–7800.
      out(session, (long ? OUTH25 : OUTH26) + CRLF);
      return;
    }

    default:
      // Unknown iwhat — no-op (source falls back through `goto 100` to pop the next).
      void nplcf;
      return;
  }
}
