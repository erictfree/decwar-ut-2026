/**
 * BUILD — fortify a friendly captured planet; the 5th BUILD converts it to a starbase.
 *
 * Source: `DECWAR.FOR:520–591` (subroutine BUILD); strings `MSG.MAC:12–19`. Classification:
 * Preserve exactly. Zero RNG draws.
 *
 * Pre-conditions:
 *   • Coordinates resolved via `parseMoveTarget` (ABS/REL/COMPUTED per `icflg`).
 *   • Ship Chebyshev-1 adjacent to the target sector.
 *   • Target sector class ∈ {DX.NPLN, DX.FPLN, DX.EPLN}.
 *   • Target planet is **already friendly** (dispc == DX.NPLN + team).
 *
 * Action per call:
 *   • Slot-exhaustion guard (source line 539): if the planet is at buildCount=4 AND the
 *     team already has KNBASE active bases, refuse with `BUILD4`/`BUILD5` (non-time-consuming).
 *   • Increment `buildCount` (1..5). On stages 1..4 print "<n> build(s)".
 *   • `tpoint[KPBBAS] += 500 * buildCount` per stage (source line 546).
 *   • Stage 5 — planet→starbase conversion: scan `bases[team][]` for an empty slot (strength ≤ 0).
 *     If none (defensive fallback, source line 553), revert buildCount and refuse.
 *     Otherwise: +2500 bonus, `nbase[team]++`, init the base (strength 1000, copied scanMask),
 *     `plnrmv(state, i, team)` (compact planet array), and overwrite the cell with the
 *     starbase code. Emit `<ship> builds planet <loc> into a <base>`.
 *
 * Time-consuming (5s `etim+slwest*1000+4000`, computed last; pacing-pause deferred). The
 * `plnlok` race-mitigation lock is a no-op here — the TS runtime is single-threaded.
 */
import { CRLF } from "../render/output.ts";
import { parseMoveTarget } from "../parser/locate.ts";
import { prloc } from "../render/format.ts";
import {
  BUILD1, BUILD2, BUILD3, BUILD4, BUILD5, BUILD7, CAPTU5, NOPLNT, SHIP_NAMES, OBJ_NAMES,
} from "../render/strings.ts";
import { ldis } from "../core/geometry.ts";
import { plnrmv } from "../lifecycle/place.ts";
import { KNBASE, DX, PT, SHIELD_CAP } from "../core/constants.ts";
import type { GameState } from "../core/state.ts";
import type { Session } from "../core/session.ts";

export async function build(state: GameState, session: Session): Promise<boolean> {
  const who = session.who;
  const ship = state.ships[who];
  if (!ship) return false;

  const target = await parseMoveTarget(state, session);
  if (target === null) return false; // aborted (error/hangup/EOL); non-time-consuming

  // ── Adjacency (source 532–533) ──────────────────────────────────────────────────────────
  if (!ldis(ship.vPos, ship.hPos, target.v, target.h, 1)) {
    session.io.write(`${CRLF}${SHIP_NAMES[who]} ${CAPTU5}${CRLF}`);
    return false;
  }

  // ── Target must be a planet (any color) ─────────────────────────────────────────────────
  const cls = state.board.dispc(target.v, target.h);
  if (cls < DX.NPLN || cls > DX.EPLN) {
    session.io.write(NOPLNT + CRLF);
    return false;
  }

  // ── Must be friendly (already captured by our team) ─────────────────────────────────────
  if (cls !== DX.NPLN + session.team) {
    session.io.write(BUILD7 + CRLF);
    return false;
  }

  const i = state.board.dispx(target.v, target.h);
  const planet = state.planets[i];
  if (!planet) return false;

  // ── Slot-exhaustion guard at stage 4→5 (source line 539) ────────────────────────────────
  if (planet.buildCount === 4 && (state.nbase[session.team] ?? 0) === KNBASE) {
    emitBasesStillFunctional(session);
    return false;
  }

  // ── Increment build count ───────────────────────────────────────────────────────────────
  planet.buildCount += 1;
  if (planet.buildCount !== 5) {
    // Stages 1..4: just print "<n> build(s)".
    session.io.write(
      `${planet.buildCount}${BUILD3}${planet.buildCount > 1 ? "s" : ""}${CRLF}`,
    );
  }
  session.tpoint[PT.KPBBAS] = (session.tpoint[PT.KPBBAS] ?? 0) + 500 * planet.buildCount;

  if (planet.buildCount !== 5) {
    session.ptime += state.slwest * 1000 + 4000; // source 525: v = etim + slwest*1000 + 4000
    return true;
  }

  // ── Stage 5: planet → starbase conversion (source 553–576) ──────────────────────────────
  // Find first empty base slot.
  const bases = state.bases[session.team]!;
  let slot = 0;
  for (let j = 1; j <= KNBASE; j++) {
    if ((bases[j]?.strength ?? 0) <= 0) { slot = j; break; }
  }
  if (slot === 0) {
    // Defensive: no empty slot found despite the upstream guard.  Source DECWAR.FOR:
    // 553–558 reverts buildCount (back to 4) but DOES NOT refund the +2500 KPBBAS that
    // was already added at source line 546.  This is a source quirk (line 546's
    // unconditional add happens BEFORE the slot scan at line 553-555) -- preserve as
    // written, even though it's only reachable if `nbase[team]` desyncs from the actual
    // base slots.  See CLAUDE.md "do not smooth over strange behavior".
    planet.buildCount -= 1;
    emitBasesStillFunctional(session);
    return false;
  }

  session.tpoint[PT.KPBBAS] = (session.tpoint[PT.KPBBAS] ?? 0) + 2500;
  state.nbase[session.team] = (state.nbase[session.team] ?? 0) + 1;
  // Stash the planet's scanMask before compaction (source: base(j,4,team) = locpln(i,4)).
  const carriedScanMask = planet.scanMask;
  const vLoc = target.v;
  const hLoc = target.h;

  plnrmv(state, i, session.team); // compact planet array; updates board for shifted neighbors

  // Initialize the new base in slot `slot`.
  const newBase = bases[slot]!;
  newBase.vPos = vLoc;
  newBase.hPos = hLoc;
  newBase.strength = SHIELD_CAP; // 1000 (source line 567)
  newBase.scanMask = carriedScanMask;

  // Overwrite the cell with the new starbase code: (DX.FBAS + team - 1) * 100 + slot.
  const newDisp = (DX.FBAS + session.team - 1) * 100 + slot;
  state.board.setdsp(vLoc, hLoc, newDisp);

  // Emit "<ship> builds planet <loc> into a <new base>"
  session.io.write(
    `${CRLF}${SHIP_NAMES[who]} ${BUILD1}${prloc(
      vLoc, hLoc, 0, 0, session.ocflg, session.oflg, ship.vPos, ship.hPos,
    )}${BUILD2}${objNameOf(newDisp)}${CRLF}`,
  );
  // Pause budget — source DECWAR.FOR:525: `v = etim + slwest*1000 + 4000`.
  session.ptime += state.slwest * 1000 + 4000;
  return true;
}

function emitBasesStillFunctional(session: Session): void {
  // BUILD4 "\r\nAll " + team's base side label + BUILD5 "s still functional, captain." + CRLF.
  // Source emits `odisp((team+2)*100, 0)` which is the base CLASS marker only (no slot).
  const teamBaseClass = DX.FBAS + session.team - 1; // 3 Fed / 4 Emp
  session.io.write(
    `${BUILD4}${OBJ_NAMES[teamBaseClass] ?? "base"}${BUILD5}${CRLF}`,
  );
}

function objNameOf(code: number): string {
  const cls = Math.trunc(code / 100);
  const idx = code % 100;
  if (cls === DX.FSHP || cls === DX.ESHP) return SHIP_NAMES[idx] ?? `ship ${idx}`;
  return OBJ_NAMES[cls] ?? "object";
}
