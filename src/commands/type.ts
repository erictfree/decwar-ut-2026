/**
 * TYPE — show the player's OUTPUT switches or the game OPTION switches.
 *
 * Source: `DECWAR.FOR:4550–4604`; analysis Deliverable #4 §2 (#30). Classification: Preserve
 * exactly. Async because it prompts for the OUTPUT/OPTION switch when not given (`O` alone is
 * ambiguous → `ambswi`). Renders existing session flags (`oflg`/`prtype`/`scnflg`/`icflg`/`ocflg`)
 * and game options (version, Romulan, black holes).
 *
 * SIMPLIFICATION: the terminal-type name (`ttydat`) is rendered as the index (the ttydat table
 * is deferred).
 */
import { tokenize } from "../parser/tokenizer.ts";
import { equal } from "../parser/match.ts";
import { CRLF } from "../render/output.ts";
import {
  TYPE01, TYPE02, TYPE03, TYPE04, TYPE05, TYPE06, TYPE07, TYPE08, TYPE09,
  AMBSWI, SHTFRM, MEDFRM, LNGFRM, BTHFRM, NORMAL, INFORM, SET008, DECVER, SETU06, SETU07,
} from "../render/strings.ts";
import { TOK, KCMDTM } from "../core/constants.ts";
import type { GameState } from "../core/state.ts";
import type { Session, TokenBuffers } from "../core/session.ts";

async function readArgLine(session: Session): Promise<string | null> {
  let line: string | null = null;
  while (line === null && !session.hungup) line = await session.io.readCommandLine(KCMDTM);
  return session.hungup ? null : line;
}

function outputSwitches(state: GameState, session: Session): string {
  const verb = session.oflg < 0 ? SHTFRM : session.oflg > 0 ? LNGFRM : MEDFRM;
  const scan = session.scnflg < 0 ? SHTFRM : LNGFRM;
  const ic = session.icflg < 0 ? "Relative " : session.icflg > 0 ? "Absolute " : BTHFRM;
  const oc = session.ocflg < 0 ? "Relative " : session.ocflg > 0 ? "Absolute " : BTHFRM;
  return (
    `${TYPE02}${CRLF}` +
    `${verb}${TYPE03}${CRLF}` +
    `${session.prtype !== 0 ? INFORM : NORMAL}${TYPE04}${CRLF}` +
    `${scan}${TYPE05}${CRLF}` +
    `${ic}${TYPE08}${CRLF}` +
    `${oc}${TYPE09}${CRLF}` +
    `${SET008}${session.ttytyp}${CRLF}`
  );
}

function optionSwitches(state: GameState): string {
  return (
    `${CRLF}${DECVER}${CRLF}` +
    `${state.romopt ? SETU06 : TYPE06}${CRLF}` +
    `${state.blhopt ? SETU07 : TYPE07}${CRLF}`
  );
}

export async function type(state: GameState, session: Session, kind: 0 | 1 | 2 = 0): Promise<void> {
  if (kind === 1) {
    session.io.write(outputSwitches(state, session));
    return;
  }
  if (kind === 2) {
    session.io.write(optionSwitches(state));
    return;
  }
  let toks: TokenBuffers = session.tokens;
  let p = 2;
  for (;;) {
    if (toks.type[p] === TOK.KALF) {
      const k = toks.text[p] ?? "";
      const mOut = equal(k, "OUTPUT") !== 0;
      const mOpt = equal(k, "OPTION") !== 0;
      if (mOut && mOpt) {
        session.io.write(AMBSWI + CRLF); // "O" matches both → ambiguous
      } else if (mOut) {
        session.io.write(outputSwitches(state, session));
        return;
      } else if (mOpt) {
        session.io.write(optionSwitches(state));
        return;
      }
    }
    session.io.write(TYPE01);
    const line = await readArgLine(session);
    if (line === null) return;
    toks = tokenize(line, 0).tokens;
    if (toks.type[1] === TOK.KEOL || toks.ntok === 0) return;
    p = 1;
  }
}
