/**
 * SCAN / SRSCAN — render the sector grid around the ship.
 *
 * Source: `DECWAR.FOR:3512–3603` (SCAN/SRSCAN) + `WARMAC.MAC:2769–2969` (SETSCN/MARK/SHWSCN
 * + the `objtbl` symbol table). Classification: Preserve exactly (the grid is product output).
 *
 * Default range KRANGE=10 (SCAN) / 7 (SRSCAN), clamped to `(terwid-9)/4`. Optional direction
 * (UP/DOWN/LEFT/RIGHT/CORNER), 1–2 range numbers, and a WARNING switch. Each cell is the 2-char
 * `objtbl` symbol (short scans drop the first char). The grid prints row numbers on both sides
 * and column numbers above and below; planets/enemy bases in range are marked scanned.
 *
 * SIMPLIFICATIONS: the WARNING `!` overlay marks (MARK) are accepted but not drawn; exact
 * short-format column-label spacing is approximate (Phase-G polish).
 */
import { equal } from "../parser/match.ts";
import { ldis } from "../core/geometry.ts";
import { CRLF } from "../render/output.ts";
import { SYNTAX, SHIP_TAGS } from "../render/strings.ts";
import { KRANGE, KGALV, KGALH, KNBASE, TOK } from "../core/constants.ts";
import type { GameState } from "../core/state.ts";
import type { Session } from "../core/session.ts";

const pad2 = (n: number): string => (n < 10 && n >= 0 ? ` ${n}` : `${n}`);

function cellChars(state: GameState, v: number, h: number, short: boolean): string {
  let code = state.board.disp(v, h);
  if (code < 0) code = 0; // cloaked (7777 → -1) shows as empty space
  const cls = Math.trunc(code / 100);
  const idx = code % 100;
  let pair: [string, string];
  switch (cls) {
    case 1: // fed ship
    case 2: // emp ship
      pair = [" ", SHIP_TAGS[idx] ?? "?"];
      break;
    case 3: pair = ["<", ">"]; break; // fed base
    case 4: pair = [")", "("]; break; // emp base
    case 5: pair = ["?", "?"]; break; // romulan
    case 6: pair = [" ", "@"]; break; // neutral planet
    case 7: pair = ["@", "F"]; break; // fed planet
    case 8: pair = ["@", "E"]; break; // emp planet
    case 9: pair = [" ", "*"]; break; // star
    case 10: pair = [" ", " "]; break; // black hole
    default: pair = [" ", "."]; // empty
  }
  return short ? pair[1] : pair[0] + pair[1];
}

function colHeader(hMin: number, hMax: number, short: boolean): string {
  const step = short ? 3 : 2;
  const cols: string[] = [];
  for (let h = hMin; h <= hMax; h += step) cols.push(pad2(h));
  return (short ? "  " : "   ") + cols.join(short ? " " : "  ") + CRLF;
}

function renderGrid(
  state: GameState,
  session: Session,
  vMin: number,
  vMax: number,
  hMin: number,
  hMax: number,
): string {
  const short = session.scnflg < 0;
  let out = CRLF + colHeader(hMin, hMax, short);
  for (let v = vMax; v >= vMin; v--) {
    let row = `${pad2(v)} `;
    for (let h = hMin; h <= hMax; h++) row += cellChars(state, v, h, short);
    out += `${row} ${pad2(v)}${CRLF}`;
  }
  return out + colHeader(hMin, hMax, short);
}

export function scan(state: GameState, session: Session, srscan: boolean): void {
  const ship = state.ships[session.who];
  if (!ship) return;
  const t = session.tokens;

  const def = srscan ? 7 : KRANGE;
  let dist = [def, def, def, def]; // [up(+V), down(-V), right(+H), left(-H)]
  const k = Math.trunc((session.terwid - 9) / 4);
  if (dist[0]! > k) dist = [k, k, k, k];

  let ntok = t.ntok;
  if (ntok > 1 && equal(t.text[ntok] ?? "", "WARNING") !== 0) ntok--; // WARNING accepted (marks deferred)

  let mod = 0;
  let p = 2;
  let n = 0;
  const dir = t.text[2] ?? "";
  if (equal(dir, "UP") !== 0) mod = 2;
  else if (equal(dir, "DOWN") !== 0) mod = 1;
  else if (equal(dir, "RIGHT") !== 0) mod = 4;
  else if (equal(dir, "LEFT") !== 0) mod = 3;
  else if (equal(dir, "CORNER") !== 0) mod = 5;
  if (mod !== 0) p = 3;

  if (p <= ntok && t.type[p] === TOK.KINT) {
    const d = t.val[p] ?? 0;
    n = 1;
    p++;
    dist = [d, d, d, d];
    if (p <= ntok && t.type[p] === TOK.KINT) {
      const d2 = t.val[p] ?? 0;
      n = 2;
      p++;
      dist[2] = d2;
      dist[3] = d2;
    }
  }

  if (mod === 5) {
    if (n !== 2) {
      session.io.write(SYNTAX + CRLF);
      return;
    }
    if (dist[0]! > 0) dist[1] = 0;
    if (dist[0]! < 0) dist[1] = -dist[0]!;
    if (dist[2]! > 0) dist[3] = 0;
    if (dist[2]! < 0) dist[3] = -dist[2]!;
  } else if (mod !== 0) {
    dist[mod - 1] = 0;
  }

  for (let i = 0; i < 4; i++) {
    if (dist[i]! < 0) dist[i] = 0;
    if (dist[i]! > KRANGE) dist[i] = KRANGE;
  }

  const vMax = Math.min(ship.vPos + dist[0]!, KGALV);
  const vMin = Math.max(ship.vPos - dist[1]!, 1);
  const hMax = Math.min(ship.hPos + dist[2]!, KGALH);
  const hMin = Math.max(ship.hPos - dist[3]!, 1);

  // Mark planets / enemy bases in range as scanned by our side (LIST "known" flag).
  const enemy = (3 - session.team) as 1 | 2;
  for (let i = 1; i <= state.nplnet; i++) {
    const pl = state.planets[i];
    if (pl && ldis(pl.vPos, pl.hPos, ship.vPos, ship.hPos, KRANGE)) pl.scanMask |= session.team;
  }
  const ebases = state.bases[enemy];
  for (let i = 1; i <= KNBASE; i++) {
    const b = ebases?.[i];
    if (b && b.strength > 0 && ldis(b.vPos, b.hPos, ship.vPos, ship.hPos, KRANGE)) {
      b.scanMask |= session.team;
    }
  }

  session.io.write(renderGrid(state, session, vMin, vMax, hMin, hMax));
}
