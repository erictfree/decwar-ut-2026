// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 Eric Freeman and The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * DAMAGES — report per-device damage.
 *
 * Source: `DECWAR.FOR:780–828`; ODEV `WARMAC.MAC:2434–2464`. Classification: Preserve exactly.
 *
 * With no argument: "All devices functional." if nothing is damaged, else a header + one line
 * per damaged device (name + ×10 damage). With device-name arguments (matched against the
 * 2-char `device` mnemonics): report exactly those devices. Medium format; the short/long
 * tab-column layout is a Phase-G polish item.
 */
import { equal } from "../parser/match.ts";
import { oflt } from "../render/format.ts";
import { CRLF } from "../render/output.ts";
import { ALLDOK, DMHDR1, DMHDR2, DEVICE_NAMES, DEVICE_MED, UNITS1 } from "../render/strings.ts";
import { KNDEV, TOK, OFLG } from "../core/constants.ts";
import type { GameState } from "../core/state.ts";
import type { Session } from "../core/session.ts";

/**
 * @param startToken  First token index to scan for device-name arguments. Default 2 (the
 *                    direct DAMAGES command). Set to 3 from REPAIR DAMAGE to skip past the
 *                    DAMAGE keyword (source: `call damage(ntoken+1)` at DECWAR.FOR:3205).
 */
export function damages(state: GameState, session: Session, startToken = 2): void {
  const dev = state.devices[session.who];
  if (!dev) return;

  let anyDamaged = false;
  for (let i = 1; i <= KNDEV; i++) if ((dev[i] ?? 0) > 0) anyDamaged = true;
  if (!anyDamaged) {
    session.io.write(`${CRLF}${ALLDOK}${CRLF}`);
    return;
  }

  const long = session.oflg === OFLG.LONG;
  const line = (i: number): string =>
    `${(DEVICE_MED[i] ?? "?").padEnd(10)}${oflt(dev[i] ?? 0, 4, false)}${long ? UNITS1 : ""}${CRLF}`;

  // Specific device(s) requested?
  const t = session.tokens;
  if (t.ntok >= startToken && t.type[startToken] === TOK.KALF) {
    let out = CRLF;
    for (let i = startToken; i <= t.ntok; i++) {
      if (t.type[i] !== TOK.KALF) break;
      for (let j = 1; j <= KNDEV; j++) {
        if (equal(t.text[i] ?? "", DEVICE_NAMES[j] ?? "") !== 0) out += line(j);
      }
    }
    session.io.write(out);
    return;
  }

  // General report: header + every damaged device.
  let out = `${CRLF}${DMHDR1}${DMHDR2}${CRLF}`;
  for (let i = 1; i <= KNDEV; i++) if ((dev[i] ?? 0) > 0) out += line(i);
  session.io.write(out);
}
