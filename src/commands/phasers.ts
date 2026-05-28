/**
 * PHACON — phaser fire control (the PHASERS command).
 *
 * Source: `DECWAR.FOR:2635–2749`; analysis Deliverable #6 §4. Classification: Preserve exactly.
 *
 * Flow: phaser-dead guard → parse `[size] v h` target → resolve the object at that cell →
 * reject non-targets / friendly fire / out-of-range / own location → (shields-up firing cost)
 * → overheat roll → dispatch PHADAM → enqueue the phaser-hit event (and base under-attack /
 * destroyed alerts) → pay `phit*10` energy, go RED, set the bank cooldown. Returns true for a
 * completed (time-consuming) fire.
 *
 * RNG draw order: iran(100) [overheat test]; iff overheated iran(100) [damage]; then PHADAM.
 *
 * SIMPLIFICATIONS (deferred): planet (6–8) and Romulan (5) phaser targets (rejected with a
 * note before any energy is spent); the bank cooldown PAUSE (banks are selected/stamped but
 * not time-gated yet — pacing is deferred); LOCATE re-prompt-on-error (aborts instead).
 */
import { tokenize } from "../parser/tokenizer.ts";
import { equal } from "../parser/match.ts";
import { pdist } from "../core/geometry.ts";
import { pridis } from "../comms/messageBus.ts";
import { phadam } from "../combat/damage.ts";
import { pharom } from "../combat/romulan.ts";
import { CRLF } from "../render/output.ts";
import {
  PHACN0,
  PHACN1,
  PHACN2,
  PHACN4,
  PHACN5,
  PHACN7,
  PHACN8,
  PHACN9,
  ERROR1,
  ERROR2,
  COORD1,
  ERLOC1,
  ERLOC7,
  ERLOC8,
  ERLOC9,
} from "../render/strings.ts";
import {
  KCRIT,
  KRANGE,
  KGALV,
  KGALH,
  KCMDTM,
  DEV,
  DX,
  COND,
  COORD,
  OFLG,
  PT,
} from "../core/constants.ts";
import type { GameState } from "../core/state.ts";
import type { Session, TokenBuffers } from "../core/session.ts";
import type { HitEvent } from "../comms/messageBus.ts";

interface PhaserTarget {
  v: number;
  h: number;
  size: number | null; // explicit power, or null for the default 200
}

async function readArgLine(session: Session): Promise<string | null> {
  let line: string | null = null;
  while (line === null && !session.hungup) line = await session.io.readCommandLine(KCMDTM);
  return session.hungup ? null : line;
}

/** Parse `[ABS|REL] [size] v h` from the phaser command (prompting if no inline args). */
async function parseTarget(state: GameState, session: Session): Promise<PhaserTarget | null> {
  const ship = state.ships[session.who]!;
  let toks: TokenBuffers = session.tokens;
  let p = 2;
  if (p > toks.ntok) {
    session.io.write(COORD1);
    const line = await readArgLine(session);
    if (line === null) return null;
    toks = tokenize(line, 0).tokens;
    p = 1;
    if (toks.ntok === 0) return null;
  }

  let relative = session.icflg !== COORD.ABS;
  const k = toks.text[p] ?? "";
  if (equal(k, "ABSOLUTE")) {
    relative = false;
    p++;
  } else if (equal(k, "RELATIVE")) {
    relative = true;
    p++;
  }

  const ints: number[] = [];
  for (let i = p; i <= toks.ntok; i++) {
    if (toks.type[i] === 1 /* KINT */) ints.push(toks.val[i] ?? 0);
  }
  let size: number | null = null;
  let vi: number;
  let hi: number;
  if (ints.length === 2) {
    vi = ints[0]!;
    hi = ints[1]!;
  } else if (ints.length === 3) {
    size = ints[0]!;
    vi = ints[1]!;
    hi = ints[2]!;
  } else {
    session.io.write((ints.length < 2 ? ERLOC1 : ERLOC7) + CRLF);
    return null;
  }

  const v = vi + (relative ? ship.vPos : 0);
  const h = hi + (relative ? ship.hPos : 0);
  if (v < 1 || v > KGALV) {
    session.io.write(ERLOC8 + CRLF);
    return null;
  }
  if (h < 1 || h > KGALH) {
    session.io.write(ERLOC9 + CRLF);
    return null;
  }
  return { v, h, size };
}

export async function phasers(state: GameState, session: Session): Promise<boolean> {
  const who = session.who;
  const ship = state.ships[who]!;
  const dev = state.devices[who]!;

  if ((dev[DEV.KDPHAS] ?? 0) >= KCRIT) {
    session.io.write(PHACN0 + CRLF);
    return false;
  }

  const target = await parseTarget(state, session);
  if (target === null) return false;
  const { v, h } = target;

  const nplc = state.board.dispc(v, h);
  const ip = state.board.dispx(v, h);
  if (nplc < DX.FSHP || nplc > DX.EPLN) {
    session.io.write(PHACN7 + CRLF); // no target there
    return false;
  }
  if (nplc < DX.FBAS && (state.alive[ip] ?? 0) >= 0) {
    session.io.write(PHACN7 + CRLF); // target ship not active
    return false;
  }
  const id = pdist(v, h, ship.vPos, ship.hPos);
  if (id === 0) {
    session.io.write((session.oflg === OFLG.LONG ? ERROR1 : ERROR2) + CRLF);
    return false;
  }
  const team = session.team;
  if (nplc === team || nplc === team + 2 || nplc === team + DX.NPLN) {
    session.io.write(PHACN9 + CRLF); // friendly object
    return false;
  }
  if (id > KRANGE) {
    session.io.write(PHACN1 + CRLF); // out of range
    return false;
  }

  // Power (default 200; user 50–500).
  let phit = 200;
  if (target.size !== null) {
    if (target.size < 50 || target.size > 500) {
      session.io.write(PHACN8 + CRLF);
      return false;
    }
    phit = target.size;
  }

  const bank = (session.phbank[2] ?? 0) < (session.phbank[1] ?? 0) ? 2 : 1;

  // Bank cooldown gate (source PHACON line 2668: `call pause(phbank(bank) - etim(tim0))`).
  // Bounded await at the read seam — no shared state has been mutated yet at this point.
  const nowMs = state.clock.monotonic();
  const ready = session.phbank[bank] ?? 0;
  if (nowMs < ready) await session.io.pause(ready - nowMs);

  // Shields-up firing cost.
  if (ship.shieldCond >= 0) {
    if (session.oflg !== OFLG.SHORT) session.io.write(PHACN2 + CRLF);
    ship.energy -= 2000;
  }

  // Overheat.
  if (state.rng.iran(100) * phit > 18900) {
    session.io.write(PHACN4 + CRLF);
    if (session.oflg === OFLG.LONG) session.io.write(PHACN5 + CRLF);
    dev[DEV.KDPHAS] = (dev[DEV.KDPHAS] ?? 0) + 750 + Math.trunc((state.rng.iran(100) * phit * 7.5) / 100);
  }

  if (nplc === DX.ROM) {
    // Romulan target: PHAROM applies the hit to the Romulan's energy pool.
    const { ihita, klflg } = pharom(state, phit, id);
    session.tpoint[PT.KPRKIL] = Math.trunc((session.tpoint[PT.KPRKIL] ?? 0) + ihita);
    if (klflg !== 0) session.tpoint[PT.KPRKIL] = (session.tpoint[PT.KPRKIL] ?? 0) + 5000; // killed
    const e: HitEvent = {
      iwhat: 1, dispfr: who + team * 100, dispto: DX.ROM * 100, ihita, critdv: 0, critdm: 0,
      vfrom: ship.vPos, hfrom: ship.hPos, vto: v, hto: h, klflg,
      shcnfr: ship.shieldCond, shstfr: ship.shieldPct, shcnto: 1, shstto: state.romulan.energy, shjump: 0,
    };
    state.bus.makeHit(e, pridis(state, v, h, KRANGE, 0) | (state.bits[who] ?? 0));
  } else if (nplc >= DX.NPLN && nplc <= DX.EPLN) {
    // Planet target (source PHACON 1000–1100). The friendly-planet refusal already short-circuited
    // above via PHACN9. For neutral/enemy planets: roll `iran(100)*phit/(25*id) > 150` to reduce
    // the planet's buildCount by 1 (floor 0). The hit event is iwhat=1.
    const planet = state.planets[ip];
    if (planet) {
      const r = state.rng.iran(100); // load-bearing draw, unconditional
      if (id > 0 && Math.trunc((r * phit) / (25 * id)) > 150) {
        planet.buildCount = Math.max(planet.buildCount - 1, 0);
      }
      const e: HitEvent = {
        iwhat: 1, dispfr: who + team * 100, dispto: nplc * 100 + ip,
        ihita: 0, critdv: 0, critdm: 0,
        vfrom: ship.vPos, hfrom: ship.hPos, vto: v, hto: h, klflg: 0,
        shcnfr: ship.shieldCond, shstfr: ship.shieldPct,
        shcnto: 0, shstto: planet.buildCount, shjump: 0,
      };
      state.bus.makeHit(e, pridis(state, v, h, KRANGE, 0));
    }
  } else {
    // Ship or base target.
    const side = nplc - 2; // (only meaningful for bases)
    if (nplc >= DX.FBAS && (state.bases[side]?.[ip]?.strength ?? 0) === 1000) {
      enqueueBaseAlert(state, session, 9, nplc, ip, v, h);
    }
    const result = phadam(
      state,
      { ship: true, player: session.player, who, team, tpoint: session.tpoint },
      nplc, ip, id, phit,
    );
    const event: HitEvent = {
      iwhat: 1, dispfr: who + team * 100, dispto: nplc * 100 + ip,
      ihita: result.ihita, critdv: result.critdv, critdm: result.critdm,
      vfrom: ship.vPos, hfrom: ship.hPos, vto: v, hto: h, klflg: result.klflg,
      shcnfr: ship.shieldCond, shstfr: ship.shieldPct, shcnto: result.shcnto, shstto: result.shstto, shjump: 0,
    };
    const sideFlag = (nplc < DX.FBAS ? nplc : nplc - 2) as 1 | 2;
    const dbits =
      pridis(state, v, h, KRANGE, sideFlag) | pridis(state, v, h, 4, 0) | (state.bits[who] ?? 0);
    state.bus.makeHit(event, dbits);
    if (nplc >= DX.FBAS && state.board.disp(v, h) === 0) {
      enqueueBaseAlert(state, session, 10, nplc, ip, v, h);
    }
  }

  // Pay energy, go RED, stamp the bank cooldown (source PHACON 2675).
  ship.energy -= phit * 10;
  ship.condition = COND.RED;
  session.phbank[bank] = state.clock.monotonic() + (state.slwest + 1) * 1500 + (dev[DEV.KDPHAS] ?? 0);
  return true;
}

function enqueueBaseAlert(
  state: GameState,
  session: Session,
  iwhat: 9 | 10,
  nplc: number,
  ip: number,
  v: number,
  h: number,
): void {
  const side = (nplc - 2 === 1 ? 1 : 2) as 1 | 2;
  // Galaxy-wide to the base's side, minus radio-off ships.
  const dbits = pridis(state, 30, 30, 100, side) & ~state.nomsg;
  const event: HitEvent = {
    iwhat,
    dispfr: session.who + session.team * 100,
    dispto: nplc * 100 + ip,
    ihita: 0,
    critdv: 0,
    critdm: 0,
    vfrom: 0,
    hfrom: 0,
    vto: v,
    hto: h,
    klflg: 0,
    shcnfr: 0,
    shstfr: 0,
    shcnto: 0,
    shstto: 0,
    shjump: 0,
  };
  state.bus.makeHit(event, dbits);
}
