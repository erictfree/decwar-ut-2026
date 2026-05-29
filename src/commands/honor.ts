// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * HONORROLL display — pre-game command 5 (PRECMD.HONORROLL) and STRTUP-prompt option.
 * Source: `WARMAC.MAC:5856–5969` (`shosta` + `dofed` / `doemp`), `MSG.MAC`-adjacent
 * banner text. Classification: Preserve semantically (layout adapted: PPN/runtime
 * columns dropped, score shown as-is rather than ÷1000 since the port stores
 * single-game totals rather than CompuServe cumulative credits).
 *
 * Display structure (per `shosta` flow):
 *   1. Banner + "(* indicates Missing in Action)"
 *   2. Side with more living high-rollers first (`stabuf+9` comparison at 5892).
 *   3. For each side: an Emerald-Star-Cluster (alive=true) section, then a
 *      Golden-Galaxy-Medal (alive=false) section. Empty sections are skipped.
 *   4. Each entry: `*` prefix iff fallen, captain name padded to 14, ship name,
 *      then score right-aligned.
 *   5. Empty roll → silent return (source `shockp` at 5868 jumps past the banner).
 */
import { CRLF, out } from "../render/output.ts";
import { SHIP_NAMES } from "../render/strings.ts";
import type { HonorEntry, HonorRoll } from "../persistence/honorRoll.ts";
import type { GameState } from "../core/state.ts";
import type { Session } from "../core/session.ts";

const BANNER =
  "\r\n\r\n--------------\r\n\r\nThe DECWAR Honor Roll\r\n\r\n(* indicates Missing in Action)\r\n\r\n";

const HEADER_FED_LIVING =
  "The Federation has awarded the\r\nfollowing Captains the Emerald\r\nStar Cluster for outstanding\r\nservice:\r\n\r\n";
const HEADER_FED_FALLEN =
  "\r\nThe Golden Galaxy Medal has been\r\nawarded in memory of these brave\r\nCaptains:\r\n\r\n";
const HEADER_EMP_LIVING =
  "The following Captains have served\r\ntheir Empire well:\r\n\r\n";
const HEADER_EMP_FALLEN =
  "\r\nThe Distinguished Service Cross\r\nhas been posthumously awarded\r\nto the following Captains for\r\ntheir outstanding service:\r\n\r\n";

const COLUMN_HEADER = "Captain        Ship           Score\r\n";

function pad(s: string, width: number): string {
  if (s.length >= width) return s.slice(0, width);
  return s + " ".repeat(width - s.length);
}

function rightPad(n: number, width: number): string {
  const s = String(n);
  if (s.length >= width) return s;
  return " ".repeat(width - s.length) + s;
}

function dspsta(session: Session, entries: HonorEntry[]): void {
  if (entries.length === 0) return;
  out(session, COLUMN_HEADER);
  for (const e of entries) {
    const flag = e.alive ? " " : "*";
    const captain = pad(e.captain || "<anon>", 14);
    const ship = pad(SHIP_NAMES[e.ship] ?? "", 14);
    const score = rightPad(e.score, 6);
    out(session, `${flag}${captain} ${ship} ${score}${CRLF}`);
  }
}

export function honor(state: GameState, session: Session): void {
  const roll: HonorRoll = state.honor.load();
  const fedLive = roll.fed.filter((e) => e.alive);
  const fedDead = roll.fed.filter((e) => !e.alive);
  const empLive = roll.emp.filter((e) => e.alive);
  const empDead = roll.emp.filter((e) => !e.alive);

  // Source `shockp` (5868): bail silently if everything is empty.
  if (
    fedLive.length === 0 && fedDead.length === 0 &&
    empLive.length === 0 && empDead.length === 0
  ) return;

  out(session, BANNER);

  // Source 5892–5900: the side with more high-rollers prints first.
  const fedFirst = fedLive.length >= empLive.length;
  const renderFed = () => {
    if (fedLive.length > 0) {
      out(session, HEADER_FED_LIVING);
      dspsta(session, fedLive);
    }
    if (fedDead.length > 0) {
      out(session, HEADER_FED_FALLEN);
      dspsta(session, fedDead);
    }
  };
  const renderEmp = () => {
    if (empLive.length > 0) {
      out(session, HEADER_EMP_LIVING);
      dspsta(session, empLive);
    }
    if (empDead.length > 0) {
      out(session, HEADER_EMP_FALLEN);
      dspsta(session, empDead);
    }
  };

  if (fedFirst) { renderFed(); renderEmp(); }
  else { renderEmp(); renderFed(); }
}
