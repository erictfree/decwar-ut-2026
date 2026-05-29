// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * Static lint — guards the **no-await-in-critical-section** invariant (Deliverable #13 §1).
 *
 * The rule: handlers must mutate shared state synchronously. The ONLY allowed `await` points
 * are the bounded read-seams: the command-read (`session.io.readCommandLine`), the pacing
 * pause (`session.io.pause`), the bounded arg-prompt helpers (`readArgLine` / `parseMoveTarget`
 * / `parseTarget` / `parseBurst` / `promptRead`), and the top-level dispatch awaits in the
 * runtime / executor / lobby / server (which are themselves the seams, not handlers).
 *
 * This test is a regex-based proxy for the real invariant (any mid-mutation await would be a
 * bug), enforced by an explicit allowlist of callee identifiers. Adding a new `await` site in
 * `src/commands/` requires either matching an allowlisted callee or extending this list — the
 * justification belongs in the same review.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = decodeURIComponent(new URL("../../src/", import.meta.url).pathname);

/** Callees that may legally appear after `await` in src/. */
const ALLOWED = new Set<string>([
  // The canonical I/O seams.
  "session.io.readCommandLine",
  "session.io.pause",
  // Bounded arg-prompt helpers (read seam, before any mutation).
  "readArgLine",
  "parseMoveTarget",
  "parseTarget",
  "parseBurst",
  "promptRead",
  // Loop / server / lobby orchestration awaits (they ARE the seams, not handlers).
  "executeCommand",
  "runLobby",
  "runSession",
  "runSetup",
  "doActivate",
  "firstPlayerPrompts",
  "selectSide",
  "selectShip",
  "readLine",
  "reincarnatePath",
  // Executor dispatches — each is a top-level command handler invoked exactly once per
  // command line, not a mid-mutation call.
  "move",
  "phasers",
  "torpedos",
  "radio",
  "tell",
  "typeCmd",
  "shields",
  "energy",
  "tractor",
  "build",
  "capture",
  "set",
  "gripe",
  // SET sub-switch helpers (read-seam prompt cascade; each handler reads its arg via
  // `nextAlfa` before any session-flag mutation — same pattern as the top-level dispatches).
  "nextAlfa",
  "setName",
  "setOutput",
  "setPrompt",
  "setScans",
  "setIcdef",
  "setOcdef",
]);

function listTsFiles(root: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    const p = join(root, name);
    if (statSync(p).isDirectory()) out.push(...listTsFiles(p));
    else if (name.endsWith(".ts")) out.push(p);
  }
  return out;
}

/**
 * Strip line and block comments, plus string/template literal contents, from a file's text so
 * the regex below doesn't trip on `await` mentions inside prose or strings.
 */
function strip(src: string): string {
  let s = src.replace(/\/\*[\s\S]*?\*\//g, ""); // block comments
  s = s.replace(/^\s*\/\/.*$/gm, ""); // line comments
  s = s.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  s = s.replace(/'(?:[^'\\]|\\.)*'/g, "''");
  s = s.replace(/`(?:[^`\\$]|\\.|\$\{[^}]*\})*`/g, "``");
  return s;
}

/**
 * Extract awaited callee identifiers (dotted-chain head before `(`) from a source string.
 * Returns the array of identifiers found, in order. Falls back to "<expr>" for non-call awaits.
 */
function awaitedCallees(src: string): string[] {
  const stripped = strip(src);
  const rx = /\bawait\s+([\w$.]+)\s*\(/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = rx.exec(stripped)) !== null) out.push(m[1]!);
  return out;
}

test("every `await` in src/ matches the read-seam allowlist (no mid-mutation awaits)", () => {
  const violations: { file: string; callee: string }[] = [];
  for (const file of listTsFiles(SRC)) {
    const text = readFileSync(file, "utf8");
    for (const callee of awaitedCallees(text)) {
      if (ALLOWED.has(callee)) continue;
      violations.push({ file: file.replace(SRC, "src/"), callee });
    }
  }
  if (violations.length > 0) {
    const lines = violations.map((v) => `  ${v.file}:  await ${v.callee}(...)`).join("\n");
    assert.fail(
      `Found await sites that aren't on the read-seam allowlist:\n${lines}\n` +
      `If the new await is genuinely a bounded read seam BEFORE any mutation, add its ` +
      `callee identifier to ALLOWED in test/unit/no-await-lint.test.ts and document why.`,
    );
  }
});
