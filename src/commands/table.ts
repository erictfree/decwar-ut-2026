/**
 * The in-game command table (`isaydo`) and keyword matching/dispatch resolution.
 *
 * Source: `DECWAR.FOR` BLOCK DATA 436–469 (the 33 keywords, in dispatch order) and the
 * GETCMD match loop `DECWAR.FOR:1238–1249`; analysis Deliverable #4 §1/§2. Classification:
 * Preserve exactly (REQ-CMD-001/002).
 *
 * `EQUAL` compares only the first 5 characters, so the master strings below are matched on
 * their 5-char prefix (e.g. "STATUS" matches via "STATU"). The 1-based index is the
 * computed-GOTO dispatch order.
 */
import { equal } from "../parser/match.ts";

/** The 33 in-game commands, in `isaydo` order (index 1..33). */
export const IN_GAME_COMMANDS: readonly string[] = [
  "", // index 0 unused (1-based)
  "BASES", // 1
  "BUILD", // 2
  "CAPTURE", // 3
  "DAMAGES", // 4
  "DOCK", // 5
  "ENERGY", // 6
  "GRIPE", // 7
  "HELP", // 8
  "IMPULSE", // 9
  "LIST", // 10
  "MOVE", // 11
  "NEWS", // 12
  "PHASERS", // 13
  "PLANETS", // 14
  "POINTS", // 15
  "QUIT", // 16
  "RADIO", // 17
  "REPAIR", // 18
  "SCAN", // 19
  "SET", // 20
  "SHIELDS", // 21
  "SRSCAN", // 22
  "STATUS", // 23
  "SUMMARY", // 24
  "TARGETS", // 25
  "TELL", // 26
  "TIME", // 27
  "TORPEDOS", // 28
  "TRACTOR", // 29
  "TYPE", // 30
  "USERS", // 31
  "*DEBUG", // 32
  "*PASSWORD", // 33
];

/** The command indices dispatched concretely so far. */
export const CMD = {
  BASES: 1,
  BUILD: 2,
  CAPTURE: 3,
  DAMAGES: 4,
  DOCK: 5,
  ENERGY: 6,
  GRIPE: 7,
  HELP: 8,
  IMPULSE: 9,
  LIST: 10,
  MOVE: 11,
  NEWS: 12,
  PHASERS: 13,
  PLANETS: 14,
  POINTS: 15,
  QUIT: 16,
  RADIO: 17,
  REPAIR: 18,
  SCAN: 19,
  SET: 20,
  SHIELDS: 21,
  SRSCAN: 22,
  STATUS: 23,
  SUMMARY: 24,
  TARGETS: 25,
  TELL: 26,
  TIME: 27,
  TORPEDOS: 28,
  TRACTOR: 29,
  TYPE: 30,
  USERS: 31,
  DEBUG: 32,
  PASSWORD: 33,
} as const;

export interface CommandMatch {
  /** Matched command index 1..33, or 0 if none. */
  cmd: number;
  /** True if the typed prefix matched two or more keywords (→ `ambcom`). */
  ambiguous: boolean;
}

/**
 * Resolve a typed token against the in-game table, reproducing the GETCMD loop: scan all 33
 * entries; any nonzero `equal` result is a match; a second match makes it ambiguous.
 */
export function matchCommand(token: string): CommandMatch {
  return matchIn(token, IN_GAME_COMMANDS);
}

/**
 * The 16 pre-game commands, in `precmd` order (SETUP.FOR:480–496). Matched with the same
 * EQUAL prefix logic as the in-game table; abbreviations are table-relative.
 */
export const PREGAME_COMMANDS: readonly string[] = [
  "", // 0 unused
  "ACTIVATE", // 1
  "DOCUMENT", // 2 (CompuServe stub — excluded)
  "GRIPE", // 3
  "HELP", // 4
  "HONORROLL", // 5
  "NEWS", // 6
  "POINTS", // 7
  "QUIT", // 8
  "SET", // 9
  "SUMMARY", // 10
  "TIME", // 11
  "TYPE", // 12
  "USERS", // 13
  "*DEBUG", // 14
  "*PASSWORD", // 15
  "*ZAP", // 16 (pre-game only)
];

export const PRECMD = {
  ACTIVATE: 1,
  GRIPE: 3,
  HELP: 4,
  HONORROLL: 5,
  NEWS: 6,
  POINTS: 7,
  QUIT: 8,
  SET: 9,
  SUMMARY: 10,
  TIME: 11,
  TYPE: 12,
  USERS: 13,
  DEBUG: 14,
  PASSWORD: 15,
  ZAP: 16,
} as const;

export function matchPregameCommand(token: string): CommandMatch {
  return matchIn(token, PREGAME_COMMANDS);
}

/** True iff the token matches an in-game-only command (→ `maicom` in the pre-game loop). */
export function isInGameCommand(token: string): boolean {
  return matchCommand(token).cmd !== 0;
}

function matchIn(token: string, table: readonly string[]): CommandMatch {
  let cmd = 0;
  for (let i = 1; i < table.length; i++) {
    if (equal(token, table[i] as string) !== 0) {
      if (cmd !== 0) return { cmd, ambiguous: true };
      cmd = i;
    }
  }
  return { cmd, ambiguous: false };
}
