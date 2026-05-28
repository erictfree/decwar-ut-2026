/**
 * TORP — photon torpedo fire control (the TORPEDOS command).
 *
 * Source: `DECWAR.FOR:4238–4436`; analysis Deliverable #6 §5. Classification: Preserve exactly.
 *
 * Flow: tube-dead guard → parse `n v h [v h [v h]]` (burst 1–3 + per-torp or shared targets) →
 * per torpedo: compute aim deflection (RNG, worse with damaged tubes/computer/own shields up),
 * consume a torp (unless docked), misfire roll (iran(100)>96 → recompute aim, maybe damage the
 * tubes, and abort the rest of the burst), travel distance (idis ≈ 8±2), walk the path (CHECK),
 * then resolve what it hits: miss / black hole / friendly-neutralize / enemy ship-or-base
 * (→ TORDAM). RED alert on firing.
 *
 * RNG draw order per torp: (ran deflection) [+ran if tubes/comp dmg] [+ran if shields up];
 * iran(100) misfire; [misfire: ran, iran(5), iran(3000)]; ran idis; CHECK ties; iran(100) aran
 * (if something hit); then TORDAM's draws.
 *
 * DEFERRED: star → nova (SNOVA/NOVA); planet torpedo targets; Romulan; JUMP displacement. A
 * star hit reports "UNAFFECTED" (the non-nova branch); planet/Romulan hits are noted, not damaged.
 */
import { tokenize } from "../parser/tokenizer.ts";
import { check } from "../movement/check.ts";
import { tordam } from "../combat/damage.ts";
import { endgam } from "../lifecycle/endgam.ts";
import type { Firer } from "../combat/damage.ts";
import { pridis } from "../comms/messageBus.ts";
import type { HitEvent } from "../comms/messageBus.ts";
import { torom } from "../combat/romulan.ts";
import { CRLF } from "../render/output.ts";
import {
  TORP00,
  TORP01,
  TORP02,
  TORP03,
  TORP04,
  TORP05,
  TORP06,
  TORP07,
  PHACN1,
  ERROR1,
  ERROR2,
} from "../render/strings.ts";
import { KCRIT, KRANGE, KCMDTM, DEV, DX, COND, OFLG, PT } from "../core/constants.ts";
import { ldis } from "../core/geometry.ts";
import { plnrmv } from "../lifecycle/place.ts";
import { snova } from "../combat/nova.ts";
import type { GameState } from "../core/state.ts";
import type { Session, TokenBuffers } from "../core/session.ts";

interface Burst {
  ntorp: number;
  targets: Array<{ v: number; h: number }>; // length ntorp
}

async function readArgLine(session: Session): Promise<string | null> {
  let line: string | null = null;
  while (line === null && !session.hungup) line = await session.io.readCommandLine(KCMDTM);
  return session.hungup ? null : line;
}

/** Parse `n v h [v h [v h]]`. Returns null on abort; reports torp-specific errors. */
async function parseBurst(state: GameState, session: Session): Promise<Burst | null> {
  let toks: TokenBuffers = session.tokens;
  let p = 2;
  if (p > toks.ntok) {
    session.io.write(TORP02 + CRLF);
    const line = await readArgLine(session);
    if (line === null) return null;
    toks = tokenize(line, 0).tokens;
    p = 1;
    if (toks.ntok === 0) return null;
  }

  const ints: number[] = [];
  for (let i = p; i <= toks.ntok; i++) if (toks.type[i] === 1 /* KINT */) ints.push(toks.val[i] ?? 0);
  if (ints.length < 3) return null; // need at least n + one (v,h)

  const ntorp = ints[0]!;
  if (ntorp > state.ships[session.who]!.torps) session.io.write(TORP03 + CRLF);
  if (ntorp > state.ships[session.who]!.torps || ntorp > 3 || ntorp < 1) {
    session.io.write(`${state.ships[session.who]!.torps}${TORP07}${CRLF}`);
    return null;
  }

  const pairs: Array<{ v: number; h: number }> = [];
  for (let i = 1; i + 1 < ints.length; i += 2) pairs.push({ v: ints[i]!, h: ints[i + 1]! });
  if (pairs.length === 0) return null;
  const last = pairs[pairs.length - 1]!;
  const targets = Array.from({ length: ntorp }, (_, k) => pairs[k] ?? last);
  return { ntorp, targets };
}

export async function torpedos(state: GameState, session: Session): Promise<boolean> {
  const who = session.who;
  const ship = state.ships[who]!;
  const dev = state.devices[who]!;

  if ((dev[DEV.KDTORP] ?? 0) >= KCRIT) {
    session.io.write(TORP00 + CRLF);
    return false;
  }
  if (ship.torps <= 0) {
    session.io.write(TORP01 + CRLF);
    return false;
  }

  const burst = await parseBurst(state, session);
  if (burst === null) return false;

  // Range / own-location validation up front (the original checks before firing).
  for (const t of burst.targets) {
    if (t.v === ship.vPos && t.h === ship.hPos) {
      session.io.write((session.oflg === OFLG.LONG ? ERROR1 : ERROR2) + CRLF);
      return false;
    }
    if (!ldis(ship.vPos, ship.hPos, t.v, t.h, KRANGE)) {
      session.io.write(PHACN1 + CRLF); // target out of range
      return false;
    }
  }

  // Torpedo-bank cooldown gate. Bounded await at the read seam — no mutation yet.
  const nowMs = state.clock.monotonic();
  if (nowMs < session.tobank) await session.io.pause(session.tobank - nowMs);

  ship.condition = COND.RED;
  const firer: Firer = { ship: true, player: session.player, who, team: session.team, tpoint: session.tpoint };
  let misfired = false;
  let fired = false;

  for (let id = 1; id <= burst.ntorp; id++) {
    if (misfired) break; // a prior misfire aborts the rest of the burst (iflg < 0)
    const t = burst.targets[id - 1]!;

    let d = (state.rng.ran() - 0.5) / 5.0; // DRAW
    if ((dev[DEV.KDTORP] ?? 0) > 0 || (dev[DEV.KDCOMP] ?? 0) > 0) d += (state.rng.ran() - 0.5) / 10.0; // DRAW
    if (ship.shieldCond > 0) d += (ship.shieldPct * (state.rng.ran() - 0.5)) / 10000.0; // DRAW

    const iV = t.v - ship.vPos;
    const iH = t.h - ship.hPos;
    if ((state.docked[who] ?? 0) >= 0) ship.torps -= 1; // consume unless docked (docked < 0)

    if (state.rng.iran(100) > 96) {
      // misfire
      session.io.write(`${TORP04}${id}${TORP05}${CRLF}`);
      d += (state.rng.ran() - 0.5) / 5.0; // DRAW
      misfired = true;
      if (state.rng.iran(5) === 5) {
        dev[DEV.KDTORP] = (dev[DEV.KDTORP] ?? 0) + 500 + state.rng.iran(3000); // DRAW + DRAW
        session.io.write(TORP06 + CRLF);
      }
    }

    const idis = KRANGE - 2 + Math.trunc((state.rng.ran() - 0.5) * 4.0 + 0.5); // DRAW
    const r = check(state.board, state.rng, ship.vPos, ship.hPos, iV, iH, idis, d);
    fired = true;
    // Use the obstacle cell (v2,h2) for a hit; the last-clear cell (v1,h1) for a miss.
    const vc = r.dcode !== 0 ? r.v2 : r.v1;
    const hc = r.dcode !== 0 ? r.h2 : r.h1;
    resolveTorpedo(state, session, firer, id, vc, hc, r.dcode);
  }

  // Stamp the torpedo bank cooldown (source TORP 4415: `tobank = etim + tpaus`). One-second
  // base per fired torp, scaled by slwest — consistent with source's per-torp accumulator.
  if (fired) {
    session.tobank = state.clock.monotonic() + burst.ntorp * (state.slwest + 1) * 1000;
  }
  return fired;
}

function resolveTorpedo(
  state: GameState,
  session: Session,
  firer: Firer,
  id: number,
  vc: number,
  hc: number,
  dcode: number,
): void {
  const who = session.who;
  const team = session.team;
  const dispfr = who + team * 100;

  function event(over: Partial<HitEvent>): HitEvent {
    return {
      iwhat: 2, dispfr, dispto: 0, ihita: 0, critdv: id, critdm: 0,
      vfrom: state.ships[who]!.vPos, hfrom: state.ships[who]!.hPos, vto: vc, hto: hc,
      klflg: 0, shcnfr: state.ships[who]!.shieldCond, shstfr: state.ships[who]!.shieldPct,
      shcnto: 0, shstto: 0, shjump: 0, ...over,
    };
  }
  const toFirer = state.bits[who] ?? 0;

  if (dcode === 0) {
    state.bus.makeHit(event({ iwhat: 4 }), toFirer); // miss
    return;
  }
  const nplc = Math.trunc(dcode / 100);

  if (nplc === DX.STAR) {
    const aran = state.rng.iran(100); // DRAW
    if (aran > 80) {
      // Star unaffected by torpedo (iwhat=6).
      state.bus.makeHit(event({ iwhat: 6, dispfr: DX.STAR * 100, vfrom: vc, hfrom: hc }), toFirer);
      return;
    }
    // aran ≤ 80 → the star goes nova (source TORP 4320–4334).
    state.board.setdsp(vc, hc, 0); // clear the star before cascade
    state.bus.makeHit(
      event({ iwhat: 7, dispfr: DX.STAR * 100, vfrom: vc, hfrom: hc }),
      pridis(state, vc, hc, KRANGE, 0) | toFirer,
    );
    session.tpoint[PT.KNSDES] = (session.tpoint[PT.KNSDES] ?? 0) - 500;
    snova(state, { player: true, team, tpoint: session.tpoint }, vc, hc);
    return;
  }
  if (nplc === DX.BHOL) {
    state.bus.makeHit(event({ iwhat: 5 }), toFirer); // swallowed by black hole
    return;
  }
  if (nplc === DX.ROM) {
    const { ihita, klflg } = torom(state);
    state.rng.iran(10); // jump-displacement chance (`iran(10)>7`) — jump deferred
    session.tpoint[PT.KPRKIL] = Math.trunc((session.tpoint[PT.KPRKIL] ?? 0) + ihita);
    if (klflg !== 0) session.tpoint[PT.KPRKIL] = (session.tpoint[PT.KPRKIL] ?? 0) + 5000;
    state.bus.makeHit(
      event({
        iwhat: 2, dispto: DX.ROM * 100, ihita, klflg,
        vto: state.romulan.vPos, hto: state.romulan.hPos, shcnto: 1, shstto: state.romulan.energy,
      }),
      pridis(state, vc, hc, KRANGE, 0) | toFirer,
    );
    return;
  }
  // Friendly object (ship/base/planet) — neutralize the torpedo (source TORP label 1300).
  if (nplc === team || nplc === team + 2 || nplc === team + DX.NPLN) {
    state.bus.makeHit(event({ iwhat: 15 }), toFirer);
    return;
  }

  // Neutral or enemy planet (source TORP label 1800). `iran(4)==4` reduces buildCount by 1;
  // `buildCount < 0` kills the planet → tpoint[KNPDES] -= 1000 and plnrmv.
  if (nplc >= DX.NPLN && nplc <= DX.EPLN) {
    const ip = dcode % 100;
    const planet = state.planets[ip];
    if (planet) {
      if (state.rng.iran(4) === 4) planet.buildCount -= 1;
      const shstto = Math.max(planet.buildCount, 0);
      let klflg: 0 | 2 = 0;
      if (planet.buildCount < 0) {
        klflg = 2;
        session.tpoint[PT.KNPDES] = (session.tpoint[PT.KNPDES] ?? 0) - 1000;
        state.board.setdsp(vc, hc, 0);
        plnrmv(state, ip, nplc - DX.NPLN);
      }
      state.bus.makeHit(
        event({
          iwhat: 2, dispto: dcode,
          vto: vc, hto: hc, klflg,
          shcnto: 0, shstto,
        }),
        pridis(state, vc, hc, KRANGE, 0) | toFirer,
      );
    }
    return;
  }

  // enemy ship or base
  const j = dcode % 100;
  if (nplc >= DX.FBAS && (state.bases[nplc - 2]?.[j]?.strength ?? 0) === 1000) {
    state.bus.makeHit(
      event({ iwhat: 9, dispto: dcode }),
      pridis(state, 30, 30, 100, (nplc - 2) as 1 | 2) & ~state.nomsg,
    );
  }
  const r = tordam(state, firer, nplc, j);
  const e = event({
    iwhat: r.iwhat, dispto: dcode, ihita: r.ihita, critdv: r.iwhat === 2 ? r.critdv : id,
    critdm: r.critdm, klflg: r.klflg, shcnto: r.shcnto, shstto: r.shstto,
  });
  state.bus.makeHit(e, pridis(state, vc, hc, KRANGE, 0) | toFirer);

  if (nplc >= DX.FBAS && state.board.disp(vc, hc) === 0) {
    state.bus.makeHit(
      event({ iwhat: 10, dispto: dcode }),
      pridis(state, 30, 30, 100, (nplc - 2) as 1 | 2) & ~state.nomsg,
    );
    // Source DECWAR.FOR:1222/3709 — after a base kill check whether the war is over.
    endgam(state);
  }
  // Source DECWAR.FOR:1222 — also check after planet destruction (plnrmv inside tordam
  // for planet-target paths handled by the caller decrements nplnet).
  if (nplc >= DX.NPLN && nplc <= DX.EPLN && r.klflg !== 0) endgam(state);
}
