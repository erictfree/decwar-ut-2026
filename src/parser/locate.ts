// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * LOCATE / RELOC — coordinate-argument parsing for movement commands.
 *
 * Source: `DECWAR.FOR:1397–1509`; analysis Deliverable #4 §4. Classification: Preserve
 * semantically.
 *
 * Parses the target sector for MOVE/IMPULSE from the already-tokenized command, honoring an
 * optional leading ABSOLUTE/RELATIVE/COMPUTED keyword (default from `icflg`). RELATIVE adds
 * the typed deltas to the ship's current position. If no coordinates were given inline, it
 * prompts "Coordinates: " (RELOC) and reads one more line — a **bounded await at the read
 * seam**, before any shared-state mutation, so the no-await-in-critical-section invariant
 * holds (the original drops locks before this input too).
 *
 * SIMPLIFICATIONS (deferred): ship-name / ROMULAN coordinate resolution; COMPUTED's
 * slow-terminal gating; the original's re-prompt-on-error loop (here an error aborts the move).
 */
import { tokenize } from "./tokenizer.ts";
import { equal } from "./match.ts";
import { TOK, COORD, KGALV, KGALH, KCMDTM, KCRIT, DEV } from "../core/constants.ts";
import { CRLF } from "../render/output.ts";
import { COORD1, DAMCOM, ERLOC1, ERLOC7, ERLOC8, ERLOC9 } from "../render/strings.ts";
import type { GameState } from "../core/state.ts";
import type { Session, TokenBuffers } from "../core/session.ts";

export interface Target {
  v: number;
  h: number;
}

async function readArgLine(session: Session): Promise<string | null> {
  let line: string | null = null;
  while (line === null && !session.hungup) {
    line = await session.io.readCommandLine(KCMDTM);
  }
  return session.hungup ? null : line;
}

/** Parse the move target. Returns null on abort/error/hangup (the move should not proceed). */
export async function parseMoveTarget(
  state: GameState,
  session: Session,
): Promise<Target | null> {
  const ship = state.ships[session.who];
  if (!ship) return null;

  let toks: TokenBuffers = session.tokens;
  let p = 2; // token after the command keyword

  // No inline coordinates → prompt and read a fresh line (RELOC).
  if (p > toks.ntok || toks.type[p] === TOK.KEOL) {
    session.io.write(COORD1);
    const line = await readArgLine(session);
    if (line === null) return null;
    toks = tokenize(line, 0).tokens;
    p = 1;
    if (toks.ntok === 0) return null;
  }

  let relative = session.icflg !== COORD.ABS; // KABS → absolute, else relative
  const k = toks.text[p] ?? "";
  if (equal(k, "ABSOLUTE")) {
    relative = false;
    p++;
  } else if (equal(k, "RELATIVE")) {
    relative = true;
    p++;
  } else if (equal(k, "COMPUTED")) {
    if ((state.devices[session.who]?.[DEV.KDCOMP] ?? 0) >= KCRIT) {
      session.io.write(DAMCOM + CRLF);
      return null;
    }
    relative = false; // (full computed-course logic deferred)
    p++;
  }

  if (toks.type[p] !== TOK.KINT || toks.type[p + 1] !== TOK.KINT) {
    session.io.write((p + 1 > toks.ntok ? ERLOC1 : ERLOC7) + CRLF);
    return null;
  }

  const v = (toks.val[p] ?? 0) + (relative ? ship.vPos : 0);
  const h = (toks.val[p + 1] ?? 0) + (relative ? ship.hPos : 0);
  if (v < 1 || v > KGALV) {
    session.io.write(ERLOC8 + CRLF);
    return null;
  }
  if (h < 1 || h > KGALH) {
    session.io.write(ERLOC9 + CRLF);
    return null;
  }
  return { v, h };
}
