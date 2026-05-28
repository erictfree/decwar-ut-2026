/**
 * DOCK — refit at a friendly base or captured planet.
 *
 * Source: `DECWAR.FOR:888–933` (subroutine DOCK); strings `MSG.MAC:47–49`. Classification:
 * Preserve exactly. Zero RNG draws.
 *
 * Adjacency: Chebyshev ≤ 1 (`ldis(...,1)`) from the player's ship to every alive friendly
 * base (strength > 0) and every captured-friendly planet (DX.NPLN+team). Bases contribute +2
 * to the `ifract` counter, friendly planets +1 (source 900/909).
 *
 * On `ifract == 0`: emit ODISP of the cell's display code (the ship's own marker) + DOCK01
 * + CRLF; return non-time-consuming (`return 1` in source).
 *
 * On `ifract > 0` (success), all caps applied with `min0`/`max0`:
 *   • torps    += 5 * ifract  (cap 10)
 *   • energy   += 5000 * ifract  in ×10 → +50000*ifract  (cap ENERGY_CAP=50000 ×10 = 5000 raw)
 *     Wait — source 920 is `(ifract*5000)` and the cap is `50000`. The ship.energy field is
 *     stored ×10, so source `5000` is already the ×10 value (= raw 500). Match source verbatim:
 *     `energy = min(energy + 5000*ifract, 50000)`.
 *   • shieldPct += 100 * ifract  (cap 1000)  — also ×10, same rule
 *   • damage   -= 500 * ifract   (floor 0)
 *   • If ship was ALREADY docked, damage `-= 500*ifract` AGAIN (source 925; intentional
 *     double-heal when re-docking — preserved as a source quirk).
 *   • docked[who] = -1 (sign-as-flag; <0 = docked, matches existing TS convention)
 *   • lifeSupport = 5, condition = GREEN
 *
 * Emits DOCKIN ("DOCKED.").
 *
 * If `tknlst(2) == 'STATUS'` (the `DOCK STATUS` suffix), append a status report by calling
 * renderStatus(...) — source line 930 calls `status(3)` which is the full report path.
 *
 * Pacing pause `ptime = v - etim(tim0)` deferred (consistent with the rest of the port).
 */
import { CRLF } from "../render/output.ts";
import { DOCK01, DOCKIN } from "../render/strings.ts";
import { equal } from "../parser/match.ts";
import { ldis } from "../core/geometry.ts";
import {
  KNBASE, COND, KNTORP_MAX, ENERGY_CAP, SHIELD_CAP, KLFSUP_MAX, DX, TOK,
} from "../core/constants.ts";
import { renderStatus } from "./status.ts";
import type { GameState } from "../core/state.ts";
import type { Session } from "../core/session.ts";

export function dock(state: GameState, session: Session): boolean {
  const who = session.who;
  const ship = state.ships[who];
  if (!ship) return false;

  // Friendly side index (1 Fed / 2 Emp) is the captain's team.
  const team = session.team;
  const vS = ship.vPos, hS = ship.hPos;
  let ifract = 0;

  // Bases: alive (strength > 0) AND within Chebyshev 1.
  for (let j = 1; j <= KNBASE; j++) {
    const b = state.bases[team]?.[j];
    if (!b || b.strength <= 0) continue;
    if (ldis(vS, hS, b.vPos, b.hPos, 1)) ifract += 2;
  }

  // Friendly captured planets: dispc(v,h) === DX.NPLN + team AND within range 1.
  // Loop guarded by numcap[team]>0 in source (no friendly planets ⇒ skip).
  if ((state.numcap[team] ?? 0) > 0) {
    for (let i = 1; i <= state.nplnet; i++) {
      const p = state.planets[i];
      if (!p) continue;
      if (state.board.dispc(p.vPos, p.hPos) !== DX.NPLN + team) continue;
      if (ldis(vS, hS, p.vPos, p.hPos, 1)) ifract += 1;
    }
  }

  // No adjacent friendly port → emit the ship's marker + " not adjacent to base!!".
  if (ifract === 0) {
    const cellDisp = state.board.disp(vS, hS);
    // Source: call odisp(cellDisp, 1) then out(dock01,1). odisp prints the object code; for
    // the ship-on-its-own-cell that's the ship marker (1 space sep). Approximate with the
    // SHIP_TAGS short form when available; full ODISP wiring is a deferred render-polish item.
    session.io.write(`${CRLF}${cellDisp}${DOCK01}${CRLF}`);
    return false; // source: return 1 (non-time-consuming)
  }

  // ── Refit ────────────────────────────────────────────────────────────────────────────────
  const alreadyDocked = (state.docked[who] ?? 0) < 0;
  ship.torps = Math.min(ship.torps + 5 * ifract, KNTORP_MAX);
  ship.energy = Math.min(ship.energy + 5000 * ifract, ENERGY_CAP);
  ship.shieldPct = Math.min(ship.shieldPct + 100 * ifract, SHIELD_CAP);
  ship.damage = Math.max(ship.damage - 500 * ifract, 0);
  if (alreadyDocked) {
    // Source 925: double-heal when already docked. Preserved as a source quirk.
    ship.damage = Math.max(ship.damage - 500 * ifract, 0);
  }
  state.docked[who] = -1;
  ship.lifeSupport = KLFSUP_MAX;
  ship.condition = COND.GREEN;

  session.io.write(DOCKIN + CRLF);

  // DOCK STATUS — append a status report (source line 930: `status(3)`).
  if (session.tokens.type[2] === TOK.KALF && equal(session.tokens.text[2] ?? "", "STATUS") !== 0) {
    renderStatus(state, session, null);
  }
  // Pause budget — source DECWAR.FOR:894: `v = etim + slwest*1000 + 1000`. The loop applies it
  // before the next prompt via session.ptime.
  session.ptime += state.slwest * 1000 + 1000;
  return true; // time-consuming
}
