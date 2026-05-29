// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * Honor-roll persistence — the analog of `DECWAR.STA` (WARMAC.MAC:5856 `shosta`,
 * 5564 `updsta`, 6156 `stazap`). Stores per-side rosters of recent captains keyed by
 * connection identity, so HONORROLL can display them across game resets and *Zap can
 * clear them.
 *
 * The source layout is a binary blob with KNSTAT slots per side per (living, fallen)
 * group; the port preserves the SEMANTICS — two side rosters, with an `alive` flag
 * distinguishing the "Emerald Star Cluster" (living, just quit) from the "Golden
 * Galaxy Medal" (fallen, died) categories — but stores everything as JSON.
 *
 * I/O is intentionally synchronous (small file, infrequent calls from `freeShip` /
 * pre-game HONORROLL / *Zap; staying sync keeps freeShip on a single non-async path).
 * The `InMemoryHonorStore` is the test seam; `FileHonorStore` is used by the server.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { TEAM } from "../core/constants.ts";

/** One honor-roll record (analog of one `stabuf` slot — WARMAC.MAC:5556 `updsta/shosta`). */
export interface HonorEntry {
  /** Per-connection identity (matches `session.identity`). Empty when the session never had one. */
  identity: string;
  /** Captain name from SET NAME, or "" if never set. */
  captain: string;
  /** Ship slot 1..18 they last commanded. */
  ship: number;
  /** Total accumulated points (×1, not ×10). */
  score: number;
  /**
   * `true` for high-rollers who left while still alive (Emerald Star Cluster / served their
   * Empire well); `false` for fallen captains (Golden Galaxy Medal / given their lives).
   * Source's two-list distinction at `WARMAC.MAC:5856`.
   */
  alive: boolean;
  /** Wall-clock ms when the record was last updated. */
  recordedAt: number;
}

export interface HonorRoll {
  fed: HonorEntry[];
  emp: HonorEntry[];
}

/** Storage abstraction — read/write the roll; clear it; report whether persistence is active. */
export interface HonorStore {
  load(): HonorRoll;
  save(roll: HonorRoll): void;
  clear(): void;
}

/** Returns a freshly-zeroed roll (empty side rosters). */
export function emptyRoll(): HonorRoll {
  return { fed: [], emp: [] };
}

/**
 * Insert or update one entry by `(identity, ship)`. If an entry with the same identity AND
 * ship already exists, it's overwritten in place; otherwise the entry is appended. After the
 * upsert the list is sorted by `score` descending — high rollers first, matching the source's
 * display ordering at `WARMAC.MAC:5856` (`stabuf+9` comparison).
 *
 * `cap` caps each side's roster (defaults to KNSTAT=5 like the source); the lowest-score
 * entries beyond `cap` are dropped after sort.
 */
export function upsertEntry(roll: HonorRoll, team: 1 | 2, entry: HonorEntry, cap = 5): HonorRoll {
  const side: HonorEntry[] = team === TEAM.FED ? roll.fed : roll.emp;
  // Replace any existing record for this (identity, ship). When `identity` is "" we always
  // append (an empty identity can't disambiguate).
  let replaced = false;
  if (entry.identity) {
    for (let i = 0; i < side.length; i++) {
      const e = side[i]!;
      if (e.identity === entry.identity && e.ship === entry.ship) {
        side[i] = entry;
        replaced = true;
        break;
      }
    }
  }
  if (!replaced) side.push(entry);
  side.sort((a, b) => b.score - a.score);
  if (side.length > cap) side.length = cap;
  if (team === TEAM.FED) roll.fed = side; else roll.emp = side;
  return roll;
}

/** Inert store used by tests / by the server when no persistence path is configured. */
export class InMemoryHonorStore implements HonorStore {
  #roll: HonorRoll = emptyRoll();
  load(): HonorRoll { return this.#roll; }
  save(roll: HonorRoll): void { this.#roll = roll; }
  clear(): void { this.#roll = emptyRoll(); }
}

/**
 * JSON-file backed store. Atomic write via temp file + rename. Missing file → empty roll.
 * Malformed JSON throws (corruption should fail loud, not silently zero the roll).
 */
export class FileHonorStore implements HonorStore {
  readonly #path: string;
  constructor(path: string) { this.#path = path; }

  load(): HonorRoll {
    if (!existsSync(this.#path)) return emptyRoll();
    const raw = readFileSync(this.#path, "utf8");
    const parsed = JSON.parse(raw) as Partial<HonorRoll>;
    return { fed: parsed.fed ?? [], emp: parsed.emp ?? [] };
  }

  save(roll: HonorRoll): void {
    const dir = dirname(this.#path);
    if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
    const tmp = `${this.#path}.tmp`;
    writeFileSync(tmp, JSON.stringify(roll, null, 2));
    renameSync(tmp, this.#path);
  }

  clear(): void {
    if (existsSync(this.#path)) unlinkSync(this.#path);
  }
}
