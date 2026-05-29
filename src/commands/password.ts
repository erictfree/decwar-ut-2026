// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * `*Password` — privileged-mode toggle. Source: `DECWAR.FOR:2615–2631` (subroutine PASWRD).
 *
 * The source reads:
 *   PASFLG = equal(tknlst(2), KPASS, 1)   ! match the password?
 *   if (PASFLG .eq. -1)  PASFLG = 0       ! not an exact match
 * — i.e. only an EXACT match grants privilege (the unusual third arg to `equal()` is a
 * vestige; WARMAC's `equal` ignores extra args, and `equal()` is always case-insensitive on
 * letters). On a non-match the source emits `unkcom` + `forhlp` (under non-short verbosity)
 * to disguise the existence of the command, exactly like an unknown one.
 *
 * The CompuServe `usrprj` account-gate in the source (lines 2623–2626) is excluded — see
 * CLAUDE.md ("CompuServe-only behaviors flagged for exclusion").
 *
 * The command is reachable in-game (CMD.PASSWORD=33) and pre-game (PRECMD.PASSWORD=15) and
 * has identical semantics in both. `session.tokens` already has the typed line; the password
 * candidate is token 2 (token 1 is the command itself).
 */
import { equal } from "../parser/match.ts";
import { CRLF } from "../render/output.ts";
import { UNKCOM, FORHLP } from "../render/strings.ts";
import { KPASS, OFLG } from "../core/constants.ts";
import type { Session } from "../core/session.ts";

export function password(session: Session): void {
  const candidate = session.tokens.text[2] ?? "";
  // Exact match only: equal === -2 (the source's `if -1 → 0` collapse).
  if (equal(candidate, KPASS) === -2) {
    session.pasflg = true;
    return;
  }
  // Non-match — masquerade as `unkcom` (source 2628–2629; forhlp only under non-short).
  session.io.write(UNKCOM);
  if (session.oflg !== OFLG.SHORT) session.io.write(FORHLP);
  session.io.write(CRLF);
}
