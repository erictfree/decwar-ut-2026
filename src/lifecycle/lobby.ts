// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * Pre-game lobby — the PREGAM / XGTCMD analog (Deliverable #10 §2.2–2.4).
 *
 * Two tiers, faithful to SETUP.FOR:
 *   1. The `strtup` prompt ("Enter HELp, PREgame, or blank line:"): a blank line ACTIVATEs
 *      directly; PREGAME enters the dispatch loop; HELP/HONORROLL are handled and re-prompt.
 *   2. The `PG> ` dispatch loop over the 16-command `precmd` table, with the same EQUAL prefix
 *      matching: ambiguous → ambcom; an in-game-only token → maicom; junk → unkcom (all + forhlp).
 *
 * Returns true once a ship is activated (caller then runs the in-game loop), false on QUIT or
 * hangup. Activation (`activate`) is synchronous; the lobby only `await`s at the line reads.
 *
 * Implemented concretely: ACTIVATE and QUIT, plus the matching/error paths. The other pre-game
 * commands (HONORROLL/HELP/NEWS/POINTS/SET/...) are stubbed for this increment.
 */
import { tokenize } from "../parser/tokenizer.ts";
import { equal } from "../parser/match.ts";
import {
  matchPregameCommand,
  isInGameCommand,
  PREGAME_COMMANDS,
  PRECMD,
} from "../commands/table.ts";
import { runSetup } from "./setup.ts";
import { password } from "../commands/password.ts";
import { honor } from "../commands/honor.ts";
import { zap } from "../commands/zap.ts";
import { CRLF } from "../render/output.ts";
import {
  STRTUP,
  PGAME1,
  PG_PROMPT,
  MAICOM,
  AMBCOM,
  UNKCOM,
  FORHLP,
  SHIP_NAMES,
} from "../render/strings.ts";
import { KCMDTM, TEAM } from "../core/constants.ts";
import type { GameState } from "../core/state.ts";
import type { Session } from "../core/session.ts";

/** Prompt once, then wait through idle timeouts until a line arrives or the socket drops. */
async function promptRead(session: Session, prompt: string): Promise<string | null> {
  session.io.write(prompt);
  let line: string | null = null;
  while (line === null && !session.hungup) {
    line = await session.io.readCommandLine(KCMDTM);
  }
  return session.hungup ? null : line;
}

/**
 * Run the SETUP cascade and emit the "now commanding" line on success. Async so callers
 * can drive the interactive prompts via the IO seam.
 */
async function doActivate(state: GameState, session: Session): Promise<boolean> {
  const r = await runSetup(state, session);
  if (!r.ok) return false;
  const who = session.who;
  const name = SHIP_NAMES[who] ?? `#${who}`;
  const side = session.team === TEAM.FED ? "Federation" : "Klingon Empire";
  session.io.write(`${CRLF}You are now commanding the ${side} ship ${name}.${CRLF}`);
  return true;
}

export async function runLobby(state: GameState, session: Session): Promise<boolean> {
  // ── tier 1: the strtup prompt ────────────────────────────────────────────────────────────
  let inDispatch = false;
  while (!inDispatch) {
    const line = await promptRead(session, STRTUP);
    if (line === null) return false; // hangup
    const tok = tokenize(line, 0).tokens;
    if (tok.ntok === 0) return await doActivate(state, session); // blank line → activate
    const k = tok.text[1] ?? "";
    if (equal(k, "HONORROLL")) {
      honor(state, session); // source SETUP.FOR:110–112; re-prompt afterwards
    } else if (equal(k, "HELP")) {
      // Same text store as in-game HELP — supports "HELP", "HELP *", "HELP <topic>".
      // Tokenizer already truncates to 5 chars; dispatchHelp does prefix matching.
      const topic = tok.text[2] ?? "";
      session.io.write(state.text.help(topic));
    } else if (equal(k, "PREGAME")) {
      session.io.write(PGAME1 + CRLF);
      inDispatch = true;
    }
    // anything else: re-prompt strtup
  }

  // ── tier 2: the PG> dispatch loop ─────────────────────────────────────────────────────────
  for (;;) {
    const line = await promptRead(session, PG_PROMPT);
    if (line === null) return false; // hangup
    const toks = tokenize(line, 0).tokens;
    if (toks.ntok === 0) continue;
    const k = toks.text[1] ?? "";
    // Stash on the session so concrete pre-game handlers (e.g. *Password) can read tokens.
    session.tokens = toks;
    session.lineBuf = line;
    session.bufptr = 0;

    const m = matchPregameCommand(k);
    if (m.ambiguous) {
      session.io.write(`${AMBCOM}${FORHLP}${CRLF}`);
      continue;
    }
    if (m.cmd === 0) {
      session.io.write(isInGameCommand(k) ? MAICOM : UNKCOM);
      session.io.write(`${FORHLP}${CRLF}`);
      continue;
    }
    if (m.cmd === PRECMD.ACTIVATE) return await doActivate(state, session);
    if (m.cmd === PRECMD.QUIT) return false; // pre-game Quit → monitor (no confirm)
    if (m.cmd === PRECMD.PASSWORD) {
      password(session);
      continue;
    }
    if (m.cmd === PRECMD.HONORROLL) {
      honor(state, session); // source SETUP.FOR:145 (PG> dispatch entry 5)
      continue;
    }
    if (m.cmd === PRECMD.ZAP) {
      zap(state, session); // SETUP.FOR:168 privileged-only
      continue;
    }

    session.io.write(
      `${CRLF}(${PREGAME_COMMANDS[m.cmd]} not implemented in pre-game yet.)${CRLF}`,
    );
  }
}
