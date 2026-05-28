/**
 * SET — change the player's session flags (and a few privileged game-wide flags).
 *
 * Source: `DECWAR.FOR:3609–3717`; strings `MSG.MAC:259–277`. Classification: Preserve exactly
 * (keyword grammar, prompt cascade, ambiguous-input re-prompt loop).
 *
 * Sub-switches and the flag(s) they set:
 *   • OUTPUT     SHORT/MEDIUM/LONG → session.oflg
 *   • PROMPT     NORMAL/INFORMATIVE → session.prtype (0 / -1)
 *   • SCANS      SHORT/LONG → session.scnflg
 *   • ICDEF      ABSOLUTE/RELATIVE → session.icflg
 *   • OCDEF      ABSOLUTE/RELATIVE/BOTH → session.ocflg
 *   • ROMOPT     (privileged) → state.romopt = true  (source line 3705)
 *   • ENDFLG     (privileged) → state.endflg = 1 + endgam (endgam wired in Phase F-3)
 *   • BHREMV     (privileged) → setdsp 0 on every black-hole cell
 *
 * Deferred (Phase F-3 stack): SET NAME (`usrnam` user-name editor — needs persistence), SET
 * TTYTYPE (terminal-type table — CompuServe-era data, not needed for the Node telnet seam).
 * Both fall through to a "not supported in this build" message.
 *
 * Re-prompt loop: source 3627–3630 — if the switch token isn't one of the recognized
 * keywords, emit `set001` and `gtkn`, then retry. The same is true for each sub-switch's
 * value (e.g., SET OUTPUT with no value → emit `set003` and re-read).
 */
import { tokenize } from "../parser/tokenizer.ts";
import { equal } from "../parser/match.ts";
import { CRLF } from "../render/output.ts";
import {
  SET001, SET002, SET003, SET004, SET005, SET006, SET007,
  SHTFRM, MEDFRM, LNGFRM, NORMAL, INFORM, ABSFRM, RELFRM, BTHFRM,
} from "../render/strings.ts";
import { TOK, OFLG, COORD, KCMDTM, DX, KGALV, KGALH } from "../core/constants.ts";
import type { GameState } from "../core/state.ts";
import type { Session, TokenBuffers } from "../core/session.ts";

async function readArgLine(session: Session): Promise<string | null> {
  let line: string | null = null;
  while (line === null && !session.hungup) line = await session.io.readCommandLine(KCMDTM);
  return session.hungup ? null : line;
}

/**
 * Read tokens from `session.tokens` starting at `start`, or re-prompt with `prompt` and tokenize
 * the new line. Returns the (toks, idx) where the first KALF token is, or null on hangup/EOL.
 */
async function nextAlfa(session: Session, toks0: TokenBuffers, start: number, prompt: string): Promise<{ toks: TokenBuffers; idx: number } | null> {
  let toks = toks0;
  let idx = start;
  for (;;) {
    if (toks.type[idx] === TOK.KALF) return { toks, idx };
    session.io.write(prompt);
    const line = await readArgLine(session);
    if (line === null) return null;
    toks = tokenize(line, 0).tokens;
    if (toks.type[1] === TOK.KEOL || toks.ntok === 0) return null;
    idx = 1;
  }
}

export async function set(state: GameState, session: Session): Promise<void> {
  // Top-level: identify the switch (token 2 if present, else prompt with SET001).
  const slot = await nextAlfa(session, session.tokens, 2, SET001);
  if (slot === null) return;
  const { toks, idx } = slot;
  const k = toks.text[idx] ?? "";

  if (equal(k, "NAME") !== 0) {
    await setName(session, toks, idx);
    return;
  }
  if (equal(k, "OUTPUT") !== 0) {
    await setOutput(session, toks, idx + 1);
    return;
  }
  if (equal(k, "TTYTYPE") !== 0) {
    session.io.write(`${CRLF}(SET TTYTYPE is not supported in this build.)${CRLF}`);
    return;
  }
  if (equal(k, "PROMPT") !== 0) {
    await setPrompt(session, toks, idx + 1);
    return;
  }
  if (equal(k, "SCANS") !== 0) {
    await setScans(session, toks, idx + 1);
    return;
  }
  if (equal(k, "ICDEF") !== 0) {
    await setIcdef(session, toks, idx + 1);
    return;
  }
  if (equal(k, "OCDEF") !== 0) {
    await setOcdef(session, toks, idx + 1);
    return;
  }
  if (session.pasflg) {
    if (equal(k, "ROMOPT") !== 0) { state.romopt = true; return; }
    if (equal(k, "ENDFLG") !== 0) { state.endflg = 1; return; }
    if (equal(k, "BHREMV") !== 0) {
      for (let v = 1; v <= KGALV; v++) {
        for (let h = 1; h <= KGALH; h++) {
          if (state.board.dispc(v, h) === DX.BHOL) state.board.setdsp(v, h, 0);
        }
      }
      return;
    }
  }
  // Unknown keyword → re-prompt loop (source 3627–3630 logic via nextAlfa).
  const retry = await nextAlfa(session, toks, idx + 1, SET001);
  if (retry === null) return;
  // Recurse with a synthetic tokens object so the sub-switch dispatch sees the new keyword.
  // Cheaper: just call set() again with the re-prompted tokens stashed in session.tokens.
  session.tokens = retry.toks;
  await set(state, session);
}

// ── per-switch handlers ─────────────────────────────────────────────────────────────────────

/**
 * SET NAME — source DECWAR.FOR:3631–3636. If a name follows the NAME token on the same
 * line, capture it (USRNAM(p) returns true); otherwise prompt with `set002` and read the
 * next line. Source USRNAM (WARMAC.MAC:4031) walks the input line character-by-character
 * starting just after the NAME token, copies up to 12 chars converting lowercase→uppercase
 * (delimiters and spaces are preserved verbatim), and stores into `job(who, KNAM1/KNAM2)`.
 * The port stores the result in `session.captain` — the honor-roll persistence layer
 * (F-3-4) reads `session.captain` on `freeShip` to record the captain name.
 *
 * `nameIdx` is the token index of the literal "NAME" keyword; the name (if any) starts at
 * the character immediately after that token in `session.lineBuf`.
 */
async function setName(session: Session, toks: TokenBuffers, nameIdx: number): Promise<void> {
  const ptr = toks.ptr[nameIdx] ?? 0;
  const nameTok = toks.text[nameIdx] ?? "";
  // First attempt: characters on the same line after the NAME token (matching USRNAM(p)).
  const rest = session.lineBuf.slice(ptr + nameTok.length);
  let captured = extractName(rest);
  if (captured === "") {
    // No same-line name → prompt SET002 and read a fresh line (USRNAM(0)).
    session.io.write(SET002);
    let line: string | null = null;
    while (line === null && !session.hungup) line = await session.io.readCommandLine(KCMDTM);
    if (session.hungup || line === null) return;
    captured = extractName(line);
    if (captured === "") return; // blank line → leave captain unchanged
  }
  session.captain = captured;
  // Source `setom bufptr` at usrn.5: SET NAME consumes the rest of the line.
  session.bufptr = -1;
}

/**
 * Mirror of USRNAM's character copy (WARMAC.MAC:4045–4065): skip a leading delimiter run,
 * then take up to 12 characters with lowercase folded to uppercase. Trailing whitespace is
 * trimmed (the source's "first half / second half zero" check rejects an all-whitespace
 * capture by returning false).
 */
function extractName(text: string): string {
  // Skip leading whitespace (analog of the delimiter scan in USRNAM at usrn.1).
  let s = text.replace(/^[\s]+/, "");
  if (s === "") return "";
  s = s.slice(0, 12).toUpperCase().trimEnd();
  return s;
}

async function setOutput(session: Session, toks0: TokenBuffers, start: number): Promise<void> {
  const slot = await nextAlfa(session, toks0, start, SET003);
  if (slot === null) return;
  const k = slot.toks.text[slot.idx] ?? "";
  if (equal(k, SHTFRM) !== 0) session.oflg = OFLG.SHORT;
  else if (equal(k, MEDFRM) !== 0) session.oflg = OFLG.MEDIUM;
  else if (equal(k, LNGFRM) !== 0) session.oflg = OFLG.LONG;
}

async function setPrompt(session: Session, toks0: TokenBuffers, start: number): Promise<void> {
  const slot = await nextAlfa(session, toks0, start, SET004);
  if (slot === null) return;
  const k = slot.toks.text[slot.idx] ?? "";
  if (equal(k, NORMAL) !== 0) session.prtype = 0;
  else if (equal(k, INFORM) !== 0) session.prtype = -1;
}

async function setScans(session: Session, toks0: TokenBuffers, start: number): Promise<void> {
  const slot = await nextAlfa(session, toks0, start, SET005);
  if (slot === null) return;
  const k = slot.toks.text[slot.idx] ?? "";
  if (equal(k, SHTFRM) !== 0) session.scnflg = OFLG.SHORT;
  else if (equal(k, LNGFRM) !== 0) session.scnflg = OFLG.LONG;
}

async function setIcdef(session: Session, toks0: TokenBuffers, start: number): Promise<void> {
  const slot = await nextAlfa(session, toks0, start, SET006);
  if (slot === null) return;
  const k = slot.toks.text[slot.idx] ?? "";
  if (equal(k, ABSFRM) !== 0) session.icflg = COORD.ABS;
  else if (equal(k, RELFRM) !== 0) session.icflg = COORD.REL;
}

async function setOcdef(session: Session, toks0: TokenBuffers, start: number): Promise<void> {
  const slot = await nextAlfa(session, toks0, start, SET007);
  if (slot === null) return;
  const k = slot.toks.text[slot.idx] ?? "";
  if (equal(k, ABSFRM) !== 0) session.ocflg = COORD.ABS;
  else if (equal(k, RELFRM) !== 0) session.ocflg = COORD.REL;
  else if (equal(k, BTHFRM) !== 0) session.ocflg = COORD.BOTH;
}
