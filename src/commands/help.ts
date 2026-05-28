/**
 * HELP / NEWS / GRIPE / *Debug — backed by `state.text` (the TextStore persistence seam).
 *
 * Source: WARMAC.MAC:4977–5100 (HELP), 4625–4676 (NEWS), 4682–4960 (GRIPE). Classification:
 * Preserve semantically. The source reads from `DECWAR.HLP` / `DECWAR.NWS` and appends
 * gripes to `DECWAR.GRP`; the TS port reads through `state.text` — `FileTextStore` in
 * production (configurable directory via DECWAR_TEXT_DIR) or `InMemoryTextStore` with
 * embedded fallback text for tests / zero-config deploys.
 *
 * RED-alert refusal: source HELP (lines 4984–4994) and GRIPE (4685–4694) refuse outright
 * under RED alert — players shouldn't be browsing help while being shot at. Preserved.
 */
import { CRLF } from "../render/output.ts";
import { TOK, KCMDTM, COND } from "../core/constants.ts";
import type { GameState } from "../core/state.ts";
import type { Session } from "../core/session.ts";

async function readArgLine(session: Session): Promise<string | null> {
  let line: string | null = null;
  while (line === null && !session.hungup) line = await session.io.readCommandLine(KCMDTM);
  return session.hungup ? null : line;
}

const HELP_RED_ALERT = "\r\nYou cannot get HELP while under\r\nRED alert!\r\n";
const GRIPE_RED_ALERT = "\r\nYou are not permitted to GRIPE\r\nwhile under RED alert!\r\n";
const GRIPE_PROMPT = "\r\nEnter gripe, end with a line containing '.' (or empty line)\r\n";
const GRIPE_ACK = "\r\nThank you, Captain — your gripe has been noted.\r\n";

function inRedAlert(state: GameState, session: Session): boolean {
  const ship = state.ships[session.who];
  return !!ship && ship.condition === COND.RED;
}

export function help(state: GameState, session: Session): void {
  if (inRedAlert(state, session)) {
    session.io.write(HELP_RED_ALERT);
    return;
  }
  // HELP * or HELP <topic>: ask the text store. HELP alone: general info.
  const t = session.tokens;
  if (t.type[2] === TOK.KALF) {
    const topic = t.text[2] ?? "";
    session.io.write(state.text.help(topic));
    return;
  }
  session.io.write(state.text.help(""));
}

export function news(state: GameState, session: Session): void {
  session.io.write(state.text.news());
}

export async function gripe(state: GameState, session: Session): Promise<void> {
  if (inRedAlert(state, session)) {
    session.io.write(GRIPE_RED_ALERT);
    return;
  }
  session.io.write(GRIPE_PROMPT);
  // Read lines until a single "." or an empty line.
  const lines: string[] = [];
  let line: string | null;
  for (;;) {
    line = await readArgLine(session);
    if (line === null) break;
    const trimmed = line.trim();
    if (trimmed === "." || trimmed === "") break;
    lines.push(line);
    if (lines.length >= 16) {
      session.io.write("\r\n[Too many lines -- end of gripe]\r\n");
      break;
    }
  }
  // Persist via the text store (FileTextStore appends to decwar.grp; InMemoryTextStore
  // collects for test inspection). Empty gripes are dropped silently.
  if (lines.length > 0) {
    state.text.appendGripe({
      identity: session.identity,
      captain: session.captain,
      recordedAt: state.clock.now(),
      lines,
    });
  }
  session.io.write(GRIPE_ACK);
  void CRLF;
}

export function debug(_state: GameState, session: Session): void {
  if (!session.pasflg) {
    // Source: *Debug is a privileged toggle. Non-privileged → ignore.
    return;
  }
  session.io.write("\r\n(*Debug is not available in this build.)\r\n");
}
