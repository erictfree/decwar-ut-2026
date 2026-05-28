/**
 * SETUP — the interactive opt-in / side / ship-selection cascade that runs when a player
 * activates. Source: `SETUP.FOR:179–467` (`SETUP` itself) with its `kqsrch` reincarnation
 * branches (322–356). Classification: Preserve semantically.
 *
 * Flow per activation:
 *   1. If first player (`!state.built`): prompt `setu02` (Regular/Tournament) → optional
 *      `setu03` (tournament name re-seeds the RNG); prompt `setu04` (Romulan); prompt
 *      `setu05` (black holes). Then build the universe.
 *   2. Else (later player): emit `setu06` if Romulan-enabled, `setu07` if BH-enabled.
 *   3. Side selection: emit the `setu16/17/stu17a` fleet-count banner; if |diff| ≥ 2 the
 *      smaller side is auto-assigned (source 1600–1900), otherwise the `setu18` prompt
 *      asks for FEDERATION/EMPIRE (blank → smaller side, Federation on a tie).
 *   4. Ship selection: emit the team banner (`setu11/12`), the available-ships list
 *      (`setu13`), and the `setu14` prompt; match the first token against the source's
 *      `names(who,1)` (the first word of the ship name); `setu15` and re-list on miss.
 *   5. Commit via `activate(state, session, {team, who})`.
 *
 * The kill-queue reincarnation path (KILCHK + same-ship reuse + defect + reassigned
 * prompts) lives here too: on entry we run `kqsrch` against `session.sessionId`; if a
 * record exists, the wait countdown (`KILCHK`) and skip-prompts paths run before reaching
 * the normal side/ship branches.
 *
 * No-await invariant: all `await`s are at the read seams (`io.readCommandLine`); the only
 * mutation outside the read seams is the final `activate()` call (synchronous). Inside
 * KILCHK's polling loop we await `io.pause`/`io.readCommandLine`, both seam-legal.
 */
import { tokenize } from "../parser/tokenizer.ts";
import { equal } from "../parser/match.ts";
import { activate, freeSlot, kqsrch } from "./activate.ts";
import { buildUniverse, shouldRebuildUniverse, resetHighSegment } from "./universe.ts";
import { CRLF } from "../render/output.ts";
import {
  SETU01, SETU02, SETU03, SETU04, SETU05, SETU06, SETU07,
  SETU11, SETU12, SETU13, SETU14, SETU15,
  SETU16, SETU17, STU17A, SETU18,
  SHIP_NAMES,
  DEFECT_FED, DEFECT_EMP, DEFECT_FLEETCAP, DEFECT_PROMPT,
  REASSIGN_PREFIX, REASSIGN_BEEN, REASSIGN_PROMPT,
} from "../render/strings.ts";
import { KCMDTM, KNPLAY, TEAM, TOK } from "../core/constants.ts";
import type { GameState } from "../core/state.ts";
import type { Session } from "../core/session.ts";

/** One bounded read-line awaiting the next user input; null on hangup. */
async function readLine(session: Session): Promise<string | null> {
  let line: string | null = null;
  while (line === null && !session.hungup) line = await session.io.readCommandLine(KCMDTM);
  return session.hungup ? null : line;
}

async function promptRead(session: Session, prompt: string): Promise<string | null> {
  session.io.write(prompt);
  return readLine(session);
}

/** Tokenize a line and return its first token text + whether it was blank (KEOL/no-tokens). */
function firstTok(line: string): { text: string; blank: boolean } {
  const t = tokenize(line, 0).tokens;
  const blank = t.ntok === 0 || t.type[1] === TOK.KEOL;
  return { text: t.text[1] ?? "", blank };
}

/** First-player opt-in cascade (SETUP.FOR:219–304). Returns false on hangup. */
async function firstPlayerPrompts(state: GameState, session: Session): Promise<boolean> {
  // setu02: Regular or Tournament? (default Regular). KEOL or REGULAR → goto 600.
  // TOURNAMENT → setu03 prompt (or use a second token from the same line) → setran.
  for (;;) {
    const line = await promptRead(session, SETU02);
    if (line === null) return false;
    const toks = tokenize(line, 0).tokens;
    if (toks.ntok === 0 || toks.type[1] === TOK.KEOL) break;
    const t1 = toks.text[1] ?? "";
    if (equal(t1, "REGULAR") !== 0) break;
    if (equal(t1, "TOURNAMENT") !== 0) {
      // Tournament name/number — source: i=2; if typlst(2)==KEOL, prompt setu03 and re-tokenize.
      let seedTok: { val: number; text: string; type: number } | null = null;
      if (toks.ntok >= 2 && toks.type[2] !== TOK.KEOL) {
        seedTok = { val: toks.val[2] ?? 0, text: toks.text[2] ?? "", type: toks.type[2] ?? 0 };
      } else {
        const line2 = await promptRead(session, SETU03);
        if (line2 === null) return false;
        const t2 = tokenize(line2, 0).tokens;
        if (t2.ntok >= 1 && t2.type[1] !== TOK.KEOL) {
          seedTok = { val: t2.val[1] ?? 0, text: t2.text[1] ?? "", type: t2.type[1] ?? 0 };
        }
      }
      // setran(iabs(tknlst(i))): the source sign-strips the numeric value of the token.
      // A non-numeric token's val is 0 → setran(0) re-seeds from the clock.
      const seed = seedTok ? Math.abs(Math.trunc(seedTok.val)) : 0;
      state.rng.setran(seed);
      break;
    }
    // Anything else → re-prompt setu02 (source goto 300).
  }

  // setu04: Romulan involved? (default yes). YES/blank → ROMOPT=true; NO → false; else re-prompt.
  state.romopt = true; // source line 243: ROMOPT = .TRUE. before the prompt
  for (;;) {
    const line = await promptRead(session, SETU04);
    if (line === null) return false;
    const { text, blank } = firstTok(line);
    if (blank) break;
    if (equal(text, "YES") !== 0) break;
    if (equal(text, "NO") !== 0) { state.romopt = false; break; }
    // Re-prompt on garbage (source: goto 600 returns to setu04 loop).
  }

  // setu05: black holes? (default no). YES → BLHOPT=true; NO/blank → false; else re-prompt.
  state.blhopt = false;
  for (;;) {
    const line = await promptRead(session, SETU05);
    if (line === null) return false;
    const { text, blank } = firstTok(line);
    if (blank) break;
    if (equal(text, "YES") !== 0) { state.blhopt = true; break; }
    if (equal(text, "NO") !== 0) break;
    // Re-prompt on garbage (source: goto 1100 loops back to setu05).
  }

  return true;
}

/** Later-player announcement (SETUP.FOR:313–315). */
function announceOptions(state: GameState, session: Session): void {
  if (state.romopt) session.io.write(SETU06 + CRLF);
  if (state.blhopt) session.io.write(SETU07 + CRLF);
}

/**
 * Side selection (SETUP.FOR:1600–1900). Emits the fleet-count banner, then either
 * auto-assigns when |diff| ≥ 2 or prompts SETU18. Returns the chosen team, or null on
 * hangup.
 */
async function selectSide(state: GameState, session: Session): Promise<1 | 2 | null> {
  const n1 = state.numsid[1] ?? 0;
  const n2 = state.numsid[2] ?? 0;
  session.io.write(SETU16);
  session.io.write(String(n1));
  session.io.write(SETU17);
  session.io.write(String(n2));
  session.io.write(STU17A);

  const smaller: 1 | 2 = n1 > n2 ? TEAM.EMP : TEAM.FED; // Federation on a tie
  if (Math.abs(n1 - n2) >= 2) return smaller;

  // Within 1 — ask SETU18. Blank → smaller; FEDERATION/EMPIRE → that side; else re-prompt.
  for (;;) {
    const line = await promptRead(session, SETU18);
    if (line === null) return null;
    const { text, blank } = firstTok(line);
    if (blank) return smaller;
    if (equal(text, "FEDERATION") !== 0) return TEAM.FED;
    if (equal(text, "EMPIRE") !== 0) return TEAM.EMP;
    // Garbage → re-prompt (source: goto 1700).
  }
}

/** First word of a ship name — the source's `names(who, 1)` field. */
function firstWord(name: string): string {
  return name.split(/\s+/)[0] ?? "";
}

/**
 * Ship selection (SETUP.FOR:1900–2415). Banner + list of available ships, prompt for a
 * name, match against the first word of `SHIP_NAMES[who]` for `who` in the team's range.
 * Returns the chosen slot, or null on hangup.
 */
async function selectShip(state: GameState, session: Session, team: 1 | 2): Promise<number | null> {
  const lo = team === TEAM.FED ? 1 : 10;
  const hi = team === TEAM.FED ? 9 : 18;

  session.io.write((team === TEAM.FED ? SETU11 : SETU12) + CRLF);

  for (;;) {
    session.io.write(SETU13 + CRLF + CRLF);
    for (let i = lo; i <= hi; i++) {
      if ((state.alive[i] ?? 0) > 0) session.io.write((SHIP_NAMES[i] ?? "") + CRLF);
    }
    const line = await promptRead(session, SETU14);
    if (line === null) return null;
    const { text, blank } = firstTok(line);
    if (blank) continue; // KEOL → re-list (the source's `do 2300` loops without a match)

    // Source 2300: scan all KNPLAY ships, match first word; then range-check + alive-check.
    let who = 0;
    for (let i = 1; i <= KNPLAY; i++) {
      if (equal(text, firstWord(SHIP_NAMES[i] ?? "")) !== 0) { who = i; break; }
    }
    if (who === 0 || who < lo || who > hi) continue; // re-list (source: goto 2100)
    if ((state.alive[who] ?? 0) <= 0) {
      session.io.write(SETU15 + CRLF);
      continue; // re-list (source: goto 2100)
    }
    return who;
  }
}

/**
 * Reincarnation path (SETUP.FOR:325–356). When `kqsrch` finds a previous death for this
 * session's identity, the source extracts the original (team, who) and branches:
 *   - team full → DEFECT prompt (YES → flip team, fall through to ship selection;
 *     NO → bail out)
 *   - team has room + old ship still free → reuse it directly (skip side+ship prompts)
 *   - team has room + old ship now taken → REASSIGNED prompt (YES → ship selection on
 *     same team; NO → bail)
 * Returns `{ team?, who? }` when activation should proceed:
 *   - `{team, who}` → commit directly (same-ship reuse path)
 *   - `{team}`     → defected or reassigned → run ship selection on this team
 *   - null         → user said NO at a prompt, or hangup → bail out of setup
 */
async function reincarnatePath(
  state: GameState,
  session: Session,
  kindex: number,
): Promise<{ team: 1 | 2; who?: number } | null> {
  const rec = state.kilque[kindex]!;
  const oldTeam = rec.team;
  const oldWho = rec.who;

  // Team has room → same-ship reuse OR reassigned prompt.
  if ((state.numsid[oldTeam] ?? 0) < KNPLAY / 2) {
    if ((state.alive[oldWho] ?? 0) > 0) {
      return { team: oldTeam, who: oldWho }; // commit with old ship (source: goto 1420)
    }
    // Source SETUP.FOR:345–355: "Sorry, Captain, but the <ship> has been reassigned."
    session.io.write(`${REASSIGN_PREFIX}${SHIP_NAMES[oldWho] ?? ""}${CRLF}${REASSIGN_BEEN}${CRLF}`);
    const line = await promptRead(session, REASSIGN_PROMPT);
    if (line === null) return null;
    const { text, blank } = firstTok(line);
    if (blank) return null; // source: KEOL → cc1 (bail)
    if (equal(text, "YES") !== 0) return { team: oldTeam }; // ship selection on same team
    return null; // any other answer → cc1 (bail)
  }

  // Team full → defect prompt (SETUP.FOR:329–342).
  session.io.write((oldTeam === TEAM.FED ? DEFECT_FED : DEFECT_EMP) + CRLF);
  session.io.write(DEFECT_FLEETCAP + CRLF);
  const line = await promptRead(session, DEFECT_PROMPT);
  if (line === null) return null;
  const { text, blank } = firstTok(line);
  if (blank) return null;
  if (equal(text, "YES") !== 0) {
    const flipped: 1 | 2 = oldTeam === TEAM.FED ? TEAM.EMP : TEAM.FED;
    return { team: flipped }; // ship selection on the other team
  }
  return null;
}

export interface SetupResult {
  ok: boolean;
  full: boolean;
}

/**
 * Run the full SETUP cascade and commit via `activate`. Returns ok=true on successful
 * activation. `full=true` indicates SETU01 (all ships in use) — the caller should drop
 * the session.
 */
export async function runSetup(state: GameState, session: Session): Promise<SetupResult> {
  if (state.numply >= KNPLAY) {
    session.io.write(CRLF + SETU01 + CRLF);
    return { ok: false, full: true };
  }

  const needBuild = shouldRebuildUniverse(state);
  if (needBuild) {
    // Source SETUP.FOR:200–215: first player (or first after hitime grace, or after
    // -2 total destruction) rebuilds the universe.
    const ok = await firstPlayerPrompts(state, session);
    if (!ok || session.hungup) return { ok: false, full: false };
    // Build the universe NOW — after the opt-in prompts have set ROMOPT/BLHOPT/seed and
    // BEFORE side/ship selection, which need `alive[*]=1` (set in buildUniverse) to scan
    // available slots. Source order: SETUP.FOR:700–1000 (build) precedes 1600+ (side).
    if (state.built) resetHighSegment(state);
    buildUniverse(state);
    state.built = true;
    state.tim0 = state.clock.monotonic();
  } else {
    announceOptions(state, session);
  }

  // Reincarnation path (SETUP.FOR:325). If this connection died earlier in the game and we
  // have a record, take the same-ship-reuse / defect / reassigned branches; otherwise fall
  // through to the fresh side+ship prompts.
  const kindex = kqsrch(state, session.identity);
  let chosenTeam: 1 | 2;
  let preChosenWho: number | undefined;
  if (kindex !== 0) {
    const r = await reincarnatePath(state, session, kindex);
    if (r === null) return { ok: false, full: false };
    chosenTeam = r.team;
    preChosenWho = r.who;
  } else {
    const team = await selectSide(state, session);
    if (team === null) return { ok: false, full: false };
    chosenTeam = team;
    // Pre-check: the side could be full (e.g. numply==KNPLAY-1 with diff the wrong way).
    // Source SETUP.FOR:1900 only reaches selectShip after the kindex≠0 defect branch
    // handles team-full; for the fresh path we silently fall back to the other side.
    if (freeSlot(state, chosenTeam) === 0) {
      chosenTeam = chosenTeam === TEAM.FED ? TEAM.EMP : TEAM.FED;
    }
  }

  // Choose a ship: same-ship reuse skips selectShip; otherwise run the setu11/12/13/14 cascade.
  let who: number;
  if (preChosenWho !== undefined) {
    who = preChosenWho;
  } else {
    const w = await selectShip(state, session, chosenTeam);
    if (w === null) return { ok: false, full: false };
    who = w;
  }

  const r = activate(state, session, { team: chosenTeam, who });
  if (!r.ok) {
    session.io.write(CRLF + SETU01 + CRLF);
    return { ok: false, full: r.full };
  }
  return { ok: true, full: false };
}
