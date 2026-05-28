/**
 * Tests for the text-file persistence layer (G-5). Covers parseHelp, InMemoryTextStore,
 * and FileTextStore (load fallback, present-file load, gripe round-trip).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseHelp,
  InMemoryTextStore,
  FileTextStore,
  HELP_GENERAL_FALLBACK,
  NEWS_FALLBACK,
} from "../../src/persistence/textFiles.ts";

// ── parseHelp ────────────────────────────────────────────────────────────────────────────

test("parseHelp splits into sections by '.<TOPIC>' headers", () => {
  const text = "Intro line.\nMore intro.\n.PHASERS\nLine A\nLine B\n.TORPS\nT1\nT2\n";
  const m = parseHelp(text);
  assert.match(m.get("") ?? "", /Intro line/);
  assert.match(m.get("PHASERS") ?? "", /Line A/);
  assert.match(m.get("PHASERS") ?? "", /Line B/);
  assert.match(m.get("TORPS") ?? "", /T1/);
});

test("parseHelp upper-cases header names for case-insensitive lookup", () => {
  const text = ".phasers\nLine A\n";
  const m = parseHelp(text);
  assert.ok(m.has("PHASERS"));
  assert.equal(m.has("phasers"), false);
});

test("parseHelp handles a file with no headers (single general section)", () => {
  const text = "Just text\nMore text\n";
  const m = parseHelp(text);
  assert.match(m.get("") ?? "", /Just text/);
  assert.equal(m.size, 1);
});

// ── InMemoryTextStore ────────────────────────────────────────────────────────────────────

test("InMemoryTextStore default help() returns the embedded general page", () => {
  const store = new InMemoryTextStore();
  const text = store.help("");
  assert.match(text, /Federation vs\. Empire/);
});

test("InMemoryTextStore default help('*') returns the command list", () => {
  const store = new InMemoryTextStore();
  const text = store.help("*");
  assert.match(text, /BASES BUILD CAPTURE/);
});

test("InMemoryTextStore default help('unknown') falls back with notice + general page", () => {
  const store = new InMemoryTextStore();
  const text = store.help("UNKNOWN");
  assert.match(text, /\(No HELP entry for 'UNKNOWN'\.\)/);
  assert.match(text, /Federation vs\. Empire/);
});

test("InMemoryTextStore can be seeded with custom HELP text via opts", () => {
  const store = new InMemoryTextStore({
    helpText: "General help text.\n.PHASERS\nCustom phaser help.\n",
  });
  assert.match(store.help(""), /General help text/);
  assert.match(store.help("PHASERS"), /Custom phaser help/);
});

test("InMemoryTextStore news() returns the NEWS_FALLBACK by default", () => {
  const store = new InMemoryTextStore();
  assert.equal(store.news(), NEWS_FALLBACK);
});

test("InMemoryTextStore appendGripe stores records in the in-memory list", () => {
  const store = new InMemoryTextStore();
  store.appendGripe({ identity: "u", captain: "KIRK", recordedAt: 1, lines: ["hi"] });
  assert.equal(store.gripes.length, 1);
  assert.equal(store.gripes[0]!.captain, "KIRK");
});

// ── FileTextStore ────────────────────────────────────────────────────────────────────────

test("FileTextStore: missing files → embedded fallback", () => {
  const dir = mkdtempSync(join(tmpdir(), "decwar-text-"));
  try {
    const store = new FileTextStore(dir);
    assert.match(store.help(""), /Federation vs\. Empire/);
    assert.equal(store.news(), NEWS_FALLBACK);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("FileTextStore: present decwar.hlp is loaded and parsed", () => {
  const dir = mkdtempSync(join(tmpdir(), "decwar-text-"));
  try {
    writeFileSync(
      join(dir, "decwar.hlp"),
      "Custom intro line.\n.MOVE\nMove forward by warp engines.\n",
    );
    const store = new FileTextStore(dir);
    assert.match(store.help(""), /Custom intro line/);
    assert.match(store.help("MOVE"), /Move forward by warp engines/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("FileTextStore: present decwar.nws is loaded verbatim", () => {
  const dir = mkdtempSync(join(tmpdir(), "decwar-text-"));
  try {
    writeFileSync(join(dir, "decwar.nws"), "Tonight at 8: a Romulan invasion.\n");
    const store = new FileTextStore(dir);
    assert.match(store.news(), /Romulan invasion/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("FileTextStore: appendGripe writes a JSON-Lines record to decwar.grp", () => {
  const dir = mkdtempSync(join(tmpdir(), "decwar-text-"));
  try {
    const store = new FileTextStore(dir);
    store.appendGripe({ identity: "u1", captain: "KIRK", recordedAt: 1000, lines: ["hi", "bye"] });
    store.appendGripe({ identity: "u2", captain: "PICARD", recordedAt: 2000, lines: ["yo"] });
    const path = join(dir, "decwar.grp");
    assert.ok(existsSync(path));
    const content = readFileSync(path, "utf8");
    const lines = content.trim().split("\n");
    assert.equal(lines.length, 2);
    const r0 = JSON.parse(lines[0]!) as { captain: string; lines: string[] };
    const r1 = JSON.parse(lines[1]!) as { captain: string };
    assert.equal(r0.captain, "KIRK");
    assert.deepEqual(r0.lines, ["hi", "bye"]);
    assert.equal(r1.captain, "PICARD");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("FileTextStore: appendGripe creates the directory if missing", () => {
  const root = mkdtempSync(join(tmpdir(), "decwar-text-"));
  try {
    const dir = join(root, "nested", "deep");
    const store = new FileTextStore(dir);
    store.appendGripe({ identity: "u", captain: "K", recordedAt: 0, lines: ["x"] });
    assert.ok(existsSync(join(dir, "decwar.grp")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── Embedded fallback constants ──────────────────────────────────────────────────────────

test("HELP_GENERAL_FALLBACK references the in-game command list cue", () => {
  assert.match(HELP_GENERAL_FALLBACK, /HELP \*/);
});
