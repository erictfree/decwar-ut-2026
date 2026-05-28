/**
 * RADIO — turn the sub-space radio on/off, or gag/ungag messages from individual ships.
 *
 * Source: `DECWAR.FOR:3116–3167`; analysis Deliverable #9 §4.3. Classification: Preserve exactly.
 *
 * ON/OFF toggle the shared `nomsg` bit for this ship (radio off → base alerts and TELLs are not
 * delivered). GAG/UNGAG toggle the per-player `gagmsg` bit against a named ship (filtered at
 * OUTMSG render time). Async because it prompts for a missing sub-command / ship name.
 */
import { tokenize } from "../parser/tokenizer.ts";
import { equal } from "../parser/match.ts";
import { CRLF } from "../render/output.ts";
import {
  RADIO0,
  RADIO2,
  RADON0,
  RADOFF,
  RADGAG,
  RADUNG,
  UNKSHP,
  SHIP_NAMES,
} from "../render/strings.ts";
import { TOK, KNPLAY, KCMDTM } from "../core/constants.ts";
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

export async function radio(state: GameState, session: Session): Promise<void> {
  const bitWho = state.bits[session.who] ?? 0;
  let toks: TokenBuffers = session.tokens;
  let index = 2;
  if (toks.type[2] !== TOK.KALF) {
    session.io.write(RADIO0);
    const line = await readArgLine(session);
    if (line === null) return;
    toks = tokenize(line, 0).tokens;
    index = 1;
    if (toks.ntok === 0 || toks.type[1] === TOK.KEOL) return;
  }

  const sub = toks.text[index] ?? "";
  if (equal(sub, "ON")) {
    state.nomsg &= ~bitWho;
    session.io.write(RADON0 + CRLF);
    return;
  }
  if (equal(sub, "OFF")) {
    state.nomsg |= bitWho;
    session.io.write(RADOFF + CRLF);
    return;
  }
  const isGag = equal(sub, "GAG") !== 0;
  const isUngag = equal(sub, "UNGAG") !== 0;
  if (!isGag && !isUngag) return; // unrecognized sub-command (re-prompt loop deferred)

  // Need a ship name.
  let nameTok = toks.text[index + 1] ?? "";
  if (toks.type[index + 1] !== TOK.KALF) {
    session.io.write(RADIO2);
    const line = await readArgLine(session);
    if (line === null) return;
    toks = tokenize(line, 0).tokens;
    if (toks.type[1] === TOK.KEOL || toks.ntok === 0) return;
    nameTok = toks.text[1] ?? "";
  }

  const target = matchShip(nameTok);
  if (target === 0) {
    session.io.write(UNKSHP + CRLF);
    return;
  }
  if (target === session.who) return; // gagging your own ship is a no-op

  const bitT = state.bits[target] ?? 0;
  if (isGag) {
    session.gagmsg |= bitT;
    session.io.write(`${RADGAG}${SHIP_NAMES[target]}${CRLF}`);
  } else {
    session.gagmsg &= ~bitT;
    session.io.write(`${RADUNG}${SHIP_NAMES[target]}${CRLF}`);
  }
}
