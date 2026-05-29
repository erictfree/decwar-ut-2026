// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * Clock — the injectable time source.
 *
 * Source's `etim`/`daytim`/`tim0`/`runtim` (WARMAC.MAC GETTAB calls + TOPS-10 monitor data)
 * are the original's time primitives:
 *   • `tim0` is the game-start timestamp (`etim(tim0)` ⇒ ms since game started).
 *   • `daytim(d)` is the current time of day (ms since midnight).
 *   • `runtim(d)` and per-job `KJOBTM`/`KRUNTM` are TOPS-10 CPU/job timers without portable
 *     analogs; the port treats them as 0 (informational items in TIME only).
 *
 * Classification: Technology-forced (the PDP-10 monitor calls don't exist on Node). The
 * Clock seam makes this swappable for tests, and isolates the wall-clock dependency from
 * the rest of the engine (`pacing`/cooldowns later use the same Clock).
 */
export interface Clock {
  /** Wall-clock ms since the Unix epoch. Used for the source's `daytim`. */
  now(): number;
  /** Monotonic ms since some fixed start point. Used for `etim`-style elapsed differences. */
  monotonic(): number;
}

/** Real-system clock backed by `Date.now()` and `performance.now()`. */
export class SystemClock implements Clock {
  readonly #start: number;
  constructor() { this.#start = performance.now(); }
  now(): number { return Date.now(); }
  monotonic(): number { return Math.trunc(performance.now() - this.#start); }
}

/**
 * Fake clock for tests. `monotonic()` starts at the constructor argument; `now()` returns the
 * provided wall time. Call `advance(ms)` to step both forward together; `setWall(ms)` to override
 * the wall-clock alone (without nudging monotonic).
 */
export class FakeClock implements Clock {
  #wall: number;
  #mono: number;
  constructor(wallMs = 0, monoMs = 0) {
    this.#wall = wallMs;
    this.#mono = monoMs;
  }
  now(): number { return this.#wall; }
  monotonic(): number { return this.#mono; }
  advance(ms: number): void { this.#wall += ms; this.#mono += ms; }
  setWall(ms: number): void { this.#wall = ms; }
}

/** Number of ms in a full 24-hour day (the modulus for `daytim`). */
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** `daytim` — wall-clock ms within the current calendar day. */
export function daytim(clock: Clock): number {
  return ((clock.now() % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY;
}

/**
 * `otim` — format a millisecond duration as `HH:MM:SS` (WARMAC.MAC:2058–2086). Each field is
 * two zero-padded decimals; `HH` may exceed 24 if the duration is long enough.
 */
export function otim(ms: number): string {
  const total = Math.max(0, Math.trunc(ms));
  const hh = Math.trunc(total / (1000 * 60 * 60));
  const mm = Math.trunc(total / (1000 * 60)) % 60;
  const ss = Math.trunc(total / 1000) % 60;
  const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}
