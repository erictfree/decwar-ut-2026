// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 Eric Freeman and The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * Command-line tokenizer — the `GTKN` / `NXTT.` / `ANUM.` analog.
 *
 * Source: `WARMAC.MAC:1615–1804` (GTKN/NXTT./ANUM./SKPB.) and the `cbits` character-type
 * table (`WARMAC.MAC:954–1083`); analysis Deliverable #4 §1.1/§3. Classification: Preserve
 * exactly (REQ-CMD-003).
 *
 * One call tokenizes ONE command's worth of tokens from `line` starting at `start`, stopping
 * at an end-of-command (`/`), a comment (`;`), or end of line. It returns the token arrays
 * and the next scan position (`nextStart`):
 *   • `nextStart = index past a '/'`  → more stacked commands remain on the line (bufptr≥0).
 *   • `nextStart = -1`                → line consumed / `;` / end of line (read a fresh line).
 *
 * Faithful details reproduced:
 *   • Separators: space, tab, comma (a delimiter terminates a token and is consumed; runs of
 *     spacing are skipped — `skpb.`).
 *   • Case-insensitive: every character is upcased before classification/storage.
 *   • Token text capped at 5 characters (the SIXBIT-packed `tknlst` slot).
 *   • 5 token types (`typlst`): KEOL/KNUL/KINT/KFLT/KALF. A token is KALF if any non-numeric
 *     character appears; KFLT if it has a decimal point; KINT if pure digits; else KNUL.
 *   • A leading '+'/'-' is a sign only as the FIRST character; a leading '-' negates the
 *     stored value (`vallst`). Alphabetic/null tokens store value 0.
 *   • A final KEOL sentinel token is always appended.
 *   • 15-token cap (`kmaxtk`): on overflow the whole line is discarded with
 *     "Too many words -- line ignored" (signalled via `tooMany`), and `nextStart = -1`.
 *
 * NOT handled here (they live in the line editor `INLI.`, a telnet-IO concern):
 * `^H`/DEL/`^U`/`^R`/`^G`/`<ESC>`-repeat. This function receives an already-edited line.
 */
import { TOK } from "../core/constants.ts";
import type { TokenBuffers } from "../core/session.ts";

const KMAXTK = 15;
const MAX_REAL_TOKENS = KMAXTK - 1; // 14 real tokens + 1 KEOL sentinel

export interface TokenizeResult {
  tokens: TokenBuffers;
  /** Next scan position: -1 = read a fresh line; ≥0 = continue this line (after a '/'). */
  nextStart: number;
  /** True iff the 15-token cap was exceeded and the line was discarded. */
  tooMany: boolean;
}

const isSpacing = (c: string): boolean => c === " " || c === "\t";
const isDelimiter = (c: string): boolean => c === " " || c === "\t" || c === ",";
const isDigit = (c: string): boolean => c >= "0" && c <= "9";

/** Upcase a single character (ASCII), matching `caile c,137 / subi c,040`. */
function upcase(c: string): string {
  const code = c.charCodeAt(0);
  return code >= 0x61 && code <= 0x7a ? String.fromCharCode(code - 0x20) : c;
}

function freshTokens(): TokenBuffers {
  const n = KMAXTK;
  return {
    ntok: 0,
    text: new Array<string>(n + 1).fill(""),
    val: new Array<number>(n + 1).fill(0),
    type: new Array<number>(n + 1).fill(TOK.KNUL),
    ptr: new Array<number>(n + 1).fill(0),
  };
}

function appendEol(tokens: TokenBuffers, atIndex: number): void {
  tokens.type[atIndex] = TOK.KEOL;
  tokens.val[atIndex] = 0;
  tokens.text[atIndex] = "";
}

export function tokenize(line: string, start: number): TokenizeResult {
  const tokens = freshTokens();
  let i = Math.max(0, start);
  let count = 0;
  let nextStart = -1;

  for (;;) {
    // skpb.: skip leading spacing (space/tab), not other delimiters
    while (i < line.length && isSpacing(line[i] ?? "")) i++;

    // end of line → done (EOL), read a fresh line next time
    if (i >= line.length) {
      nextStart = -1;
      break;
    }

    // end-of-command before any token char on this scan position
    const first = line[i] ?? "";
    if (first === "/") {
      i++; // consume the slash
      nextStart = i; // remainder stays buffered
      break;
    }
    if (first === ";") {
      nextStart = -1; // comment to end of line
      break;
    }

    if (count >= MAX_REAL_TOKENS) {
      // 15-token cap exceeded: discard the entire line.
      const empty = freshTokens();
      appendEol(empty, 0);
      empty.ntok = 0;
      return { tokens: empty, nextStart: -1, tooMany: true };
    }

    // ── scan one token (NXTT./ANUM.) ──────────────────────────────────────────────────────
    const ptr = i;
    let chars = "";
    let hasChar = false;
    let hasNonNum = false;
    let hasNum = false;
    let hasPoint = false;
    let neg = false;
    let intPart = 0;
    let fracPart = 0;
    let fracScale = 1;
    let stop = false; // token-batch terminated by eoc/eol

    while (i < line.length) {
      const raw = line[i] ?? "";
      // end-of-command / comment terminate the token AND the batch
      if (raw === "/") {
        i++; // consume slash
        nextStart = i;
        stop = true;
        break;
      }
      if (raw === ";") {
        nextStart = -1;
        stop = true;
        break;
      }
      if (isDelimiter(raw)) {
        i++; // consume the delimiter (comma/space/tab)
        break;
      }

      const c = upcase(raw);
      const isFirst = chars.length === 0;
      hasChar = true;
      if (!hasNonNum && isDigit(c)) {
        hasNum = true;
        const d = c.charCodeAt(0) - 0x30;
        if (hasPoint) {
          fracScale *= 10;
          fracPart += d / fracScale;
        } else {
          intPart = intPart * 10 + d;
        }
      } else if (isFirst && (c === "+" || c === "-")) {
        // a sign is meaningful only as the first character (ANUM.)
        if (c === "-") neg = true;
      } else if (c === "." && !hasPoint && !hasNonNum) {
        hasPoint = true; // first decimal point converts the token to float
      } else {
        hasNonNum = true; // any other character makes the whole token alphabetic
      }

      if (chars.length < 5) chars += c;
      i++;
    }

    // classify (NXTT. type logic)
    let type: number;
    let value = 0;
    if (!hasChar) {
      type = TOK.KNUL;
    } else if (hasNonNum) {
      type = TOK.KALF;
    } else if (hasPoint) {
      type = TOK.KFLT;
      value = intPart + fracPart;
      if (neg) value = -value;
    } else if (hasNum) {
      type = TOK.KINT;
      value = neg ? -intPart : intPart;
    } else {
      type = TOK.KNUL; // e.g. a lone sign
    }

    count++;
    tokens.text[count] = chars;
    tokens.val[count] = value;
    tokens.type[count] = type;
    tokens.ptr[count] = ptr;

    if (stop) break;
  }

  appendEol(tokens, count + 1);
  tokens.ntok = count;
  return { tokens, nextStart, tooMany: false };
}
