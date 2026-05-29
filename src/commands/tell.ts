// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 Eric Freeman and The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * TELL — send a radio message to ship(s) and/or group(s).
 *
 * Source: `DECWAR.FOR:3958–4073`; analysis Deliverable #9 §4.1. Classification: Preserve exactly.
 *
 * Recipients (before a `;`) are ship names and/or group names (ALL/FEDERATION/HUMAN/EMPIRE/
 * KLINGON/FRIENDLY/ENEMY). The message body is the raw remainder of the line after the first
 * `;` (so TELL must be last on a stacked line); if there is no `;` it prompts "Msg: ". Recipients
 * are validated — radio-damaged / not-in-game / radio-off ships are dropped with a notice (the
 * source does NOT deliver to radio-off ships); the sender is excluded; addressing someone
 * auto-ungags them. Async (it may prompt for recipients or the body).
 *
 * DEFERRED: `TELL ROMULAN` (the ROMSPK taunt path); the ALTMODE/repeat (`rptflg`) guard.
 */
import { tokenize } from "../parser/tokenizer.ts";
import { equal } from "../parser/match.ts";
import { CRLF } from "../render/output.ts";
import {
  TELL01,
  TELL02,
  TELL03,
  TELL04,
  TELL05,
  TELL06,
  TELL07,
  TELL08,
  MSG_PROMPT,
  SHIP_NAMES,
} from "../render/strings.ts";
import { TOK, KNPLAY, KCMDTM, KCRIT, DEV } from "../core/constants.ts";
import { romspkSingle } from "../combat/romspk.ts";
import type { GameState } from "../core/state.ts";
import type { Session, TokenBuffers } from "../core/session.ts";

async function readArgLine(session: Session): Promise<string | null> {
  let line: string | null = null;
  while (line === null && !session.hungup) line = await session.io.readCommandLine(KCMDTM);
  return session.hungup ? null : line;
}

export async function tell(state: GameState, session: Session): Promise<void> {
  const who = session.who;
  const bitWho = state.bits[who] ?? 0;

  if ((state.devices[who]?.[DEV.KDRAD] ?? 0) >= KCRIT) {
    session.io.write(TELL01 + CRLF);
    return;
  }
  state.nomsg &= ~bitWho; // issuing TELL turns your own radio on

  let toks: TokenBuffers = session.tokens;
  let p = 2;
  if (toks.ntok <= 1) {
    session.io.write(TELL02);
    const line = await readArgLine(session);
    if (line === null) return;
    toks = tokenize(line, 0).tokens;
    p = 1;
    if (toks.ntok === 0 || toks.type[1] === TOK.KEOL) return;
  }

  // ── build the recipient mask ──────────────────────────────────────────────────────────────
  let dbits = 0;
  for (let i = p; i <= toks.ntok; i++) {
    const tok = toks.text[i] ?? "";
    if (equal(tok, "ROMULAN")) {
      // Source DECWAR.FOR:3983/950 — TELL ROMULAN dispatch. If the Romulan exists, it
      // taunts the sender (a single-player ROMSPK response, source 4011) and we suppress
      // any real recipient. If the Romulan is dead, emit TELL07 "cannot raise the Romulan"
      // (source 4030–4031). The sender's `;`-body is consumed but not delivered (the
      // Romulan has no inbox to enqueue into).
      if (state.romulan.exists) {
        romspkSingle(state, session.who, session.team);
      } else {
        session.io.write(`${TELL07}Romulan${CRLF}`);
      }
      continue;
    }
    let ship = 0;
    for (let j = 1; j <= KNPLAY; j++) if (equal(tok, SHIP_NAMES[j] ?? "")) ship = j;
    if (ship !== 0) {
      dbits |= state.bits[ship] ?? 0;
      if (ship === who) session.io.write(TELL05 + CRLF);
      continue;
    }
    // group?
    let gm = false;
    let ambiguous = false;
    let gbits = 0;
    for (let g = 1; g <= session.ngroup; g++) {
      const grp = session.groups[g];
      if (!grp || grp.name === "" || equal(tok, grp.name) === 0) continue;
      if (gm) {
        ambiguous = true;
        break;
      }
      gm = true;
      gbits = grp.mask;
    }
    if (ambiguous) {
      session.io.write(`${TELL04}${tok}${CRLF}`);
      continue;
    }
    if (gm) {
      for (let j = 1; j <= KNPLAY; j++) if ((state.alive[j] ?? 0) >= 0) gbits &= ~(state.bits[j] ?? 0); // drop non-playing
      dbits |= gbits;
      continue;
    }
    session.io.write(`${TELL03}${tok}${CRLF}`);
  }

  // ── validate recipients ─────────────────────────────────────────────────────────────────────
  let mask = 1;
  for (let i = 1; i <= KNPLAY; i++) {
    if ((dbits & mask) !== 0) {
      if ((state.devices[i]?.[DEV.KDRAD] ?? 0) >= KCRIT) {
        session.io.write(`${TELL07}${SHIP_NAMES[i]}${CRLF}`); // radio damaged
        dbits &= ~mask;
      } else if ((state.alive[i] ?? 0) >= 0) {
        session.io.write(`${TELL06}${SHIP_NAMES[i]}${CRLF}`); // not in game
        dbits &= ~mask;
      } else if ((state.nomsg & mask) !== 0) {
        session.io.write(`${TELL07}${SHIP_NAMES[i]}${CRLF}`); // radio off
        dbits &= ~mask;
      }
    }
    mask <<= 1;
  }

  dbits &= ~bitWho; // remove self
  session.gagmsg &= ~dbits; // addressing someone auto-ungags them
  if (dbits === 0) {
    session.io.write(TELL08 + CRLF);
    return;
  }

  // ── body: raw remainder after the first ';', else prompt ────────────────────────────────────
  let body: string;
  const semi = session.lineBuf.indexOf(";");
  if (semi >= 0) {
    body = session.lineBuf.slice(semi + 1).replace(/^\s+/, "");
  } else {
    session.io.write(MSG_PROMPT);
    const line = await readArgLine(session);
    if (line === null) return;
    body = line;
  }

  state.bus.makeMsg({ dispfr: who + session.team * 100, recipients: dbits, body }, dbits);
}
