// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 Eric Freeman and The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * Persistence-layer tests for the honor-roll store (F-3-2). Pinned to WARMAC.MAC:5556
 * (`updsta/shosta` semantics): per-side rosters sorted descending by score, capped at
 * KNSTAT, with the `alive` flag distinguishing Emerald-Star-Cluster from
 * Golden-Galaxy-Medal categories.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TEAM } from "../../src/core/constants.ts";
import {
  emptyRoll,
  upsertEntry,
  InMemoryHonorStore,
  FileHonorStore,
  type HonorEntry,
} from "../../src/persistence/honorRoll.ts";

function entry(over: Partial<HonorEntry> = {}): HonorEntry {
  return {
    identity: over.identity ?? "id-1",
    captain: over.captain ?? "Kirk",
    ship: over.ship ?? 1,
    score: over.score ?? 100,
    alive: over.alive ?? false,
    recordedAt: over.recordedAt ?? 1_000,
  };
}

// ── upsertEntry ──────────────────────────────────────────────────────────────────────────

test("emptyRoll has empty side rosters", () => {
  const r = emptyRoll();
  assert.deepEqual(r.fed, []);
  assert.deepEqual(r.emp, []);
});

test("upsertEntry inserts a new entry on the matching side", () => {
  const r = emptyRoll();
  upsertEntry(r, TEAM.FED, entry({ score: 200 }));
  assert.equal(r.fed.length, 1);
  assert.equal(r.emp.length, 0);
  assert.equal(r.fed[0]!.score, 200);
});

test("upsertEntry sorts by score descending after insert", () => {
  const r = emptyRoll();
  upsertEntry(r, TEAM.FED, entry({ identity: "a", score: 50 }));
  upsertEntry(r, TEAM.FED, entry({ identity: "b", score: 300 }));
  upsertEntry(r, TEAM.FED, entry({ identity: "c", score: 150 }));
  assert.deepEqual(r.fed.map((e) => e.score), [300, 150, 50]);
});

test("upsertEntry caps the roster at the given size (default 5)", () => {
  const r = emptyRoll();
  for (let i = 0; i < 8; i++) {
    upsertEntry(r, TEAM.EMP, entry({ identity: `e${i}`, score: i * 10 }));
  }
  assert.equal(r.emp.length, 5);
  // The five highest scores survive.
  assert.deepEqual(r.emp.map((e) => e.score), [70, 60, 50, 40, 30]);
});

test("upsertEntry replaces an existing (identity, ship) pair in place", () => {
  const r = emptyRoll();
  upsertEntry(r, TEAM.FED, entry({ identity: "user-A", ship: 1, score: 100 }));
  upsertEntry(r, TEAM.FED, entry({ identity: "user-A", ship: 1, score: 500 }));
  assert.equal(r.fed.length, 1);
  assert.equal(r.fed[0]!.score, 500);
});

test("upsertEntry treats the same identity on different ships as separate entries", () => {
  const r = emptyRoll();
  upsertEntry(r, TEAM.FED, entry({ identity: "user-A", ship: 1, score: 100 }));
  upsertEntry(r, TEAM.FED, entry({ identity: "user-A", ship: 2, score: 200 }));
  assert.equal(r.fed.length, 2);
});

test("upsertEntry with empty identity always appends (cannot dedupe)", () => {
  const r = emptyRoll();
  upsertEntry(r, TEAM.FED, entry({ identity: "", ship: 1, score: 100 }));
  upsertEntry(r, TEAM.FED, entry({ identity: "", ship: 1, score: 200 }));
  assert.equal(r.fed.length, 2);
});

// ── InMemoryHonorStore ───────────────────────────────────────────────────────────────────

test("InMemoryHonorStore: save then load returns the same roll", () => {
  const store = new InMemoryHonorStore();
  const r = emptyRoll();
  upsertEntry(r, TEAM.FED, entry({ score: 999 }));
  store.save(r);
  const loaded = store.load();
  assert.equal(loaded.fed[0]!.score, 999);
});

test("InMemoryHonorStore: clear resets to an empty roll", () => {
  const store = new InMemoryHonorStore();
  const r = emptyRoll();
  upsertEntry(r, TEAM.FED, entry());
  store.save(r);
  store.clear();
  const loaded = store.load();
  assert.deepEqual(loaded.fed, []);
  assert.deepEqual(loaded.emp, []);
});

// ── FileHonorStore ───────────────────────────────────────────────────────────────────────

test("FileHonorStore: missing file → emptyRoll", () => {
  const dir = mkdtempSync(join(tmpdir(), "decwar-honor-"));
  try {
    const store = new FileHonorStore(join(dir, "missing.json"));
    const loaded = store.load();
    assert.deepEqual(loaded.fed, []);
    assert.deepEqual(loaded.emp, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("FileHonorStore: save writes JSON; load reads it back", () => {
  const dir = mkdtempSync(join(tmpdir(), "decwar-honor-"));
  const path = join(dir, "honor.json");
  try {
    const store = new FileHonorStore(path);
    const r = emptyRoll();
    upsertEntry(r, TEAM.FED, entry({ captain: "Picard", score: 500 }));
    upsertEntry(r, TEAM.EMP, entry({ identity: "k", captain: "Kor", score: 400 }));
    store.save(r);
    assert.ok(existsSync(path));
    const onDisk = JSON.parse(readFileSync(path, "utf8")) as ReturnType<typeof emptyRoll>;
    assert.equal(onDisk.fed[0]!.captain, "Picard");
    assert.equal(onDisk.emp[0]!.captain, "Kor");
    const reloaded = store.load();
    assert.equal(reloaded.fed[0]!.captain, "Picard");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("FileHonorStore: clear removes the file", () => {
  const dir = mkdtempSync(join(tmpdir(), "decwar-honor-"));
  const path = join(dir, "honor.json");
  try {
    const store = new FileHonorStore(path);
    store.save(emptyRoll());
    assert.ok(existsSync(path));
    store.clear();
    assert.equal(existsSync(path), false);
    // Subsequent load → emptyRoll.
    const loaded = store.load();
    assert.deepEqual(loaded.fed, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("FileHonorStore: save creates the parent directory if missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "decwar-honor-"));
  const path = join(dir, "nested", "deep", "honor.json");
  try {
    const store = new FileHonorStore(path);
    store.save(emptyRoll());
    assert.ok(existsSync(path));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("FileHonorStore: malformed JSON throws (fail loud — never silently zero)", () => {
  const dir = mkdtempSync(join(tmpdir(), "decwar-honor-"));
  const path = join(dir, "bad.json");
  try {
    writeFileSync(path, "{ not valid json");
    const store = new FileHonorStore(path);
    assert.throws(() => store.load());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
