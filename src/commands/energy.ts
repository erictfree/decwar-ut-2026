/**
 * ENERGY — ship-to-ship friendly energy transfer (10% loss).
 *
 * Source: `DECWAR.FOR:1001–1067` (subroutine ENERGY); strings `MSG.MAC:67–76, 152, 10`.
 * Classification: Preserve exactly. Zero RNG draws.
 *
 * Flow:
 *   1. Read ship-name token + integer amount; if not provided in one shot, prompt and retry.
 *   2. Match the name against the 18-slot SHIP_NAMES.
 *   3. Self? → `energ7`. Not in game? → `noship`. Enemy? → `energ2`.
 *   4. Not adjacent (ldis ≤ 1)? → `energ3`.
 *   5. amount > source.energy? → `ener4S/L`. amount ≤ 0? → `energ5`.
 *   6. Transfer (source 1058–1060):
 *        ihita = min(int(ihita * 0.9), 50000 - target.energy)   [×10 throughout]
 *        source.energy -= ihita + ihita/9                       [the 10% loss surcharge]
 *        target.energy += ihita
 *   7. Source sees `energ6`; target gets `makhit` iwhat=12 (rendered by outhit case 12).
 *
 * Non-time-consuming.
 */
import { tokenize } from "../parser/tokenizer.ts";
import { equal } from "../parser/match.ts";
import { CRLF } from "../render/output.ts";
import {
  ENER1S, ENER1L, ENERG2, ENERG3, ENER4S, ENER4L, ENERG5, ENERG6, ENERG7, ENERG8,
  NOSHIP, BEGYRP, SHIP_NAMES, UNKSHP,
} from "../render/strings.ts";
import { ldis } from "../core/geometry.ts";
import { TOK, KNPLAY, KCMDTM, OFLG, ENERGY_CAP } from "../core/constants.ts";
import type { GameState } from "../core/state.ts";
import type { Session, TokenBuffers } from "../core/session.ts";

async function readArgLine(session: Session): Promise<string | null> {
  let line: string | null = null;
  while (line === null && !session.hungup) line = await session.io.readCommandLine(KCMDTM);
  return session.hungup ? null : line;
}

function matchShip(token: string): number {
  for (let i = 1; i <= KNPLAY; i++) if (equal(token, SHIP_NAMES[i] ?? "")) return i;
  return 0;
}

export async function energy(state: GameState, session: Session): Promise<void> {
  const who = session.who;
  const ship = state.ships[who];
  if (!ship) return;
  session.io.write(CRLF);

  // ── Get ship-name (KALF) + amount (KINT) — prompt loop if not both present ────────────────
  let toks: TokenBuffers = session.tokens;
  let nameIdx = 2;
  let amtIdx = 3;
  let nameTok = "";
  let amtRaw = 0;
  const long = session.oflg === OFLG.LONG;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (toks.type[nameIdx] === TOK.KALF && toks.type[amtIdx] === TOK.KINT) {
      nameTok = toks.text[nameIdx] ?? "";
      amtRaw = toks.val[amtIdx] ?? 0;
      break;
    }
    session.io.write(long ? ENER1L : ENER1S);
    const line = await readArgLine(session);
    if (line === null) return;
    toks = tokenize(line, 0).tokens;
    if (toks.type[1] === TOK.KEOL || toks.ntok === 0) return;
    nameIdx = 1;
    amtIdx = 2;
  }

  // ── Resolve target ship ───────────────────────────────────────────────────────────────────
  const i = matchShip(nameTok);
  if (i === 0) {
    session.io.write(UNKSHP + CRLF);
    return;
  }
  if (i === who) {
    if (long) session.io.write(BEGYRP);
    session.io.write(ENERG7 + CRLF);
    return;
  }
  // alive: `alive(i)` truthy in source ⇒ TS `alive[i] < 0` (playing).
  if ((state.alive[i] ?? 0) >= 0) {
    session.io.write(NOSHIP + CRLF);
    return;
  }
  const dteam = i > KNPLAY / 2 ? 2 : 1;
  if (session.team !== dteam) {
    session.io.write(ENERG2 + CRLF);
    return;
  }
  const target = state.ships[i]!;
  if (!ldis(ship.vPos, ship.hPos, target.vPos, target.hPos, 1)) {
    session.io.write(ENERG3 + CRLF);
    return;
  }

  // ── Amount checks ─────────────────────────────────────────────────────────────────────────
  let ihita = amtRaw * 10; // raw → ×10
  if (ihita >= ship.energy) {
    session.io.write((long ? ENER4L : ENER4S) + CRLF);
    return;
  }
  if (ihita <= 0) {
    if (long) session.io.write(ENERG8);
    session.io.write(ENERG5 + CRLF);
    return;
  }

  // ── Transfer (source 1058–1060) ───────────────────────────────────────────────────────────
  ihita = Math.min(Math.trunc(ihita * 0.9), ENERGY_CAP - target.energy);
  ship.energy = ship.energy - (ihita + Math.trunc(ihita / 9));
  target.energy = target.energy + ihita;

  session.io.write(ENERG6 + CRLF);

  // Notify destination via the hit bus (iwhat=12).
  state.bus.makeHit({
    iwhat: 12,
    dispfr: who + session.team * 100,
    dispto: i + dteam * 100,
    ihita,
    critdv: 0, critdm: 0,
    vfrom: ship.vPos, hfrom: ship.hPos,
    vto: target.vPos, hto: target.hPos,
    klflg: 0,
    shcnfr: ship.shieldCond, shstfr: ship.shieldPct,
    shcnto: target.shieldCond, shstto: target.shieldPct,
    shjump: 0,
  }, state.bits[i] ?? 0);
}
