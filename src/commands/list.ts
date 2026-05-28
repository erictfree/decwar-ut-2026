/**
 * LIST / SUMMARY / BASES / PLANETS / TARGETS — list or summarize galaxy objects.
 *
 * Source: `DECWAR.FOR:1352–1382` (entries), `LSTSCN 1512–1739` (grammar), `LSTFLG/LSTOUT/
 * LSTSUM/LSTOBJ 1743–2110`, and `LSTUPD 1915–1950` (visibility gate). Classification:
 * Preserve semantically.
 *
 * FAITHFUL CORE. The 5 commands set their default object/side/range/output filters; the common
 * keyword grammar (object SHIPS/BASES/PLANETS, sides FEDERATION/HUMAN/EMPIRE/KLINGON/NEUTRAL/
 * FRIENDLY/ENEMY, CAPTURED, ALL, a range number, LIST/SUMMARY) refines them; then objects are
 * selected by side+type+range and rendered as per-object lines (enemy `*` flag, name, location,
 * shield%/builds) and/or summary counts.
 *
 * Visibility (source LSTUPD lines 1921–1932): an object is visible to the listing player iff
 *   - within KRANGE of the player's ship, OR
 *   - friendly (side == team), OR
 *   - privileged (pasflg set), OR
 *   - the object's scanMask has the player's team bit (previously scanned via SCAN, or
 *     in the Romulan's case, in range at spawn time).
 *
 * DEFERRED (→ "Illegal keyword"): CLOSEST, AND/`&` group composition, coordinate filters,
 * ship-name filters, PORTS; and the exact LSTOBJ column tabs.
 */
import { equal } from "../parser/match.ts";
import { pdist } from "../core/geometry.ts";
import { CRLF } from "../render/output.ts";
import { osflt } from "../render/format.ts";
import { OBJ_NAMES, SHIP_NAMES, INGAME, INRANG, INSPRA, LSTS02 } from "../render/strings.ts";
import { KNPLAY, KNBASE, KRANGE, KGALV, TEAM, DX, TOK } from "../core/constants.ts";
import type { GameState } from "../core/state.ts";
import type { Session } from "../core/session.ts";

export type ListKind = "LIST" | "SUMMARY" | "BASES" | "PLANETS" | "TARGETS";

const INF = 1_000_000; // range "infinity"

interface Filter {
  ships: boolean;
  bases: boolean;
  planets: boolean;
  fed: boolean;
  emp: boolean;
  neu: boolean;
  rom: boolean;
  capturedOnly: boolean;
  range: number;
  userRange: boolean;
  list: boolean;
  summary: boolean;
}

function defaults(kind: ListKind, team: 1 | 2): Filter {
  const base: Filter = {
    ships: false, bases: false, planets: false,
    fed: false, emp: false, neu: false, rom: false, capturedOnly: false,
    range: INF, userRange: false, list: true, summary: false,
  };
  switch (kind) {
    case "LIST":
      return { ...base, ships: true, bases: true, planets: true, fed: true, emp: true, neu: true, rom: true };
    case "SUMMARY":
      return { ...base, ships: true, bases: true, planets: true, fed: true, emp: true, neu: true, rom: true, list: false, summary: true };
    case "BASES":
      return { ...base, bases: true, fed: team === TEAM.FED, emp: team === TEAM.EMP, summary: true };
    case "PLANETS":
      return { ...base, planets: true, fed: true, emp: true, neu: true, range: KRANGE };
    case "TARGETS":
      return { ...base, ships: true, bases: true, planets: true, fed: team === TEAM.EMP, emp: team === TEAM.FED, rom: true, range: KRANGE };
  }
}

/** Apply one keyword to the filter; returns false if the keyword is unsupported/illegal. */
function applyKeyword(f: Filter, k: string, team: 1 | 2): boolean {
  if (equal(k, "SHIPS") !== 0) { f.ships = true; f.bases = false; f.planets = false; return true; }
  if (equal(k, "BASES") !== 0) { f.bases = true; f.ships = false; f.planets = false; return true; }
  if (equal(k, "PLANETS") !== 0) { f.planets = true; f.ships = false; f.bases = false; return true; }
  if (equal(k, "FEDERATION") !== 0 || equal(k, "HUMAN") !== 0) { f.fed = true; f.emp = false; f.neu = false; return true; }
  if (equal(k, "EMPIRE") !== 0 || equal(k, "KLINGON") !== 0) { f.emp = true; f.fed = false; f.neu = false; return true; }
  if (equal(k, "NEUTRAL") !== 0) { f.neu = true; f.fed = false; f.emp = false; f.planets = true; f.ships = false; f.bases = false; return true; }
  if (equal(k, "FRIENDLY") !== 0) { f.fed = team === TEAM.FED; f.emp = team === TEAM.EMP; f.neu = false; f.rom = false; return true; }
  if (equal(k, "ENEMY") !== 0 || equal(k, "TARGETS") !== 0) { f.fed = team === TEAM.EMP; f.emp = team === TEAM.FED; f.neu = false; f.rom = true; return true; }
  if (equal(k, "CAPTURED") !== 0) { f.capturedOnly = true; f.planets = true; f.ships = false; f.bases = false; f.neu = false; return true; }
  if (equal(k, "ALL") !== 0) { f.fed = true; f.emp = true; f.neu = true; f.rom = true; if (!f.userRange) f.range = INF; return true; }
  if (equal(k, "LIST") !== 0) { f.list = true; return true; }
  if (equal(k, "SUMMARY") !== 0) { f.summary = true; return true; }
  return false; // CLOSEST / AND / PORTS / ship names / coords → deferred
}

function rangeStr(f: Filter): string {
  if (f.range > KGALV) return INGAME;
  return f.userRange ? INSPRA : INRANG;
}

export function list(state: GameState, session: Session, kind: ListKind): void {
  const ship = state.ships[session.who];
  if (!ship) return;
  const team = session.team;
  const f = defaults(kind, team);
  const t = session.tokens;

  // ── parse keyword modifiers ────────────────────────────────────────────────────────────────
  for (let i = 2; i <= t.ntok; i++) {
    if (t.type[i] === TOK.KINT) {
      f.range = t.val[i] ?? f.range;
      f.userRange = true;
      continue;
    }
    if (t.type[i] !== TOK.KALF) continue;
    const k = t.text[i] ?? "";
    if (!applyKeyword(f, k, team)) {
      session.io.write(`${CRLF}${LSTS02}${k}${CRLF}`); // Illegal keyword (covers deferred grammar)
      return;
    }
  }

  const inRange = (v: number, h: number): boolean =>
    pdist(v, h, ship.vPos, ship.hPos) <= f.range;
  const sideSel = (side: number): boolean =>
    (side === 1 && f.fed) || (side === 2 && f.emp) || (side === 0 && f.neu) || (side === 3 && f.rom);

  /**
   * Source-faithful visibility gate (LSTUPD at DECWAR.FOR:1921–1932). An object is
   * visible if friendly, within KRANGE of the player's ship, privileged, or previously
   * scanned (the `scanMask` carries the team bit).  Pass `side === 0` for neutral
   * planets (always visible if in range) and `side === 3` for the Romulan.
   */
  const teamBit = session.team; // 1 (Fed) or 2 (Emp)
  const isKnown = (v: number, h: number, side: number, scanMask: number): boolean => {
    if (session.pasflg) return true; // privileged: god-mode visibility
    if (side === team) return true;  // friendly: always known
    if (pdist(v, h, ship.vPos, ship.hPos) <= KRANGE) return true; // within KRANGE
    return (scanMask & teamBit) !== 0; // scanned before (or detected at spawn for Rom)
  };

  let out = CRLF;
  const counts = new Map<string, number>(); // type label → count
  const bump = (label: string): void => {
    counts.set(label, (counts.get(label) ?? 0) + 1);
  };
  let nt = 0; // targets

  const objLine = (code: number, side: number, v: number, h: number, extra: string): string => {
    const enemy = side !== 0 && side !== team && kind !== "TARGETS";
    const name = code >= 100 && (Math.trunc(code / 100) === 1 || Math.trunc(code / 100) === 2)
      ? SHIP_NAMES[code % 100] ?? "?"
      : OBJ_NAMES[Math.trunc(code / 100)] ?? "?";
    return `${enemy ? "*" : " "}${name.padEnd(18)} ${v}-${h}${extra}${CRLF}`;
  };

  // Romulan
  if (
    f.rom &&
    state.romulan.exists &&
    inRange(state.romulan.vPos, state.romulan.hPos) &&
    isKnown(state.romulan.vPos, state.romulan.hPos, 3, state.romulan.scanMask)
  ) {
    if (f.list) out += objLine(DX.ROM * 100, 3, state.romulan.vPos, state.romulan.hPos, "");
    if (f.summary) { bump("Romulan"); nt++; }
  }
  // ships — enemy ships also obey isKnown (no persistent scanMask; KRANGE-only check)
  if (f.ships) {
    for (let i = 1; i <= KNPLAY; i++) {
      const side = i <= KNPLAY / 2 ? 1 : 2;
      if (!sideSel(side)) continue;
      const s = state.ships[i];
      if (!s || (state.alive[i] ?? 0) >= 0 || state.board.disp(s.vPos, s.hPos) <= 0) continue;
      if (!inRange(s.vPos, s.hPos)) continue;
      if (!isKnown(s.vPos, s.hPos, side, 0)) continue;
      if (f.list) out += objLine(side * 100 + i, side, s.vPos, s.hPos, ` ${osflt(s.shieldCond * s.shieldPct, 0, false)}%`);
      if (f.summary) { bump(OBJ_NAMES[side]!); if (side !== team) nt++; }
    }
  }
  // bases — scanMask carries detection state (own-side bit seeded at build, enemy-side
  // bit OR'd in by SCAN coverage or by combat)
  if (f.bases) {
    for (let side = 1 as 1 | 2; side <= 2; side = (side + 1) as 1 | 2) {
      if (!sideSel(side)) continue;
      const bases = state.bases[side];
      for (let j = 1; j <= KNBASE; j++) {
        const b = bases?.[j];
        if (!b || b.strength <= 0 || !inRange(b.vPos, b.hPos)) continue;
        if (!isKnown(b.vPos, b.hPos, side, b.scanMask)) continue;
        if (f.list) out += objLine((side + 2) * 100 + j, side, b.vPos, b.hPos, "");
        if (f.summary) { bump(OBJ_NAMES[side + 2]!); if (side !== team) nt++; }
      }
    }
  }
  // planets
  if (f.planets) {
    for (let i = 1; i <= state.nplnet; i++) {
      const p = state.planets[i];
      if (!p) continue;
      const cls = state.board.dispc(p.vPos, p.hPos); // 6 neutral, 7 fed, 8 emp
      const side = cls - DX.NPLN; // 0 neutral, 1 fed, 2 emp
      if (f.capturedOnly && side === 0) continue;
      if (!sideSel(side)) continue;
      if (!inRange(p.vPos, p.hPos)) continue;
      if (!isKnown(p.vPos, p.hPos, side, p.scanMask)) continue;
      if (f.list) out += objLine(cls * 100 + i, side, p.vPos, p.hPos, ` (${p.buildCount})`);
      if (f.summary) { bump(OBJ_NAMES[cls]!); if (side === 3 - team) nt++; }
    }
  }

  // summary lines
  if (f.summary) {
    const rs = rangeStr(f);
    if (kind === "TARGETS") {
      if (nt > 0) out += `${nt} target${nt !== 1 ? "s" : ""}${rs}${CRLF}`;
    } else {
      for (const [label, n] of counts) out += `${n} ${label}${n !== 1 ? "s" : ""}${rs}${CRLF}`;
    }
  }

  session.io.write(out);
}
