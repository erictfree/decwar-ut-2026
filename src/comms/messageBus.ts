// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * Hit-event message bus — the hit-queue half of the two-queue comms system.
 *
 * Source: `WARMAC.MAC:3265–3495` (MAKHIT/GETHIT), `DECWAR.FOR:3042–3057` (PRIDIS); analysis
 * Deliverable #9 §1–§3. Classification: Preserve semantically.
 *
 * Per-recipient pull-style delivery: a producer enqueues a HitEvent to a recipient bitmask
 * (`dbits`); each recipient drains its own queue at the loop boundaries (prompt entry, idle
 * heartbeat, between stacked commands). The radio/TELL message queue is a later increment.
 *
 * SIMPLIFICATIONS (deferred to the full comms increment): the 64-entry bound + oldest-overwrite
 * eviction; the exact 4-word MAKHIT packing; `hitflg` counters (we keep arrays instead).
 */
import { KNPLAY } from "../core/constants.ts";
import { ldis } from "../core/geometry.ts";
import type { GameState } from "../core/state.ts";

/** A hit-queue entry (the MAKHIT field set). Coordinates/shields per Deliverable #9 §2. */
export interface HitEvent {
  iwhat: number; // 1 phaser hit, 9 base under attack, 10 base destroyed, …
  dispfr: number; // DISP code of the hitter (side*100 + index)
  dispto: number; // DISP code of the hittee
  ihita: number; // ×10 hit size
  critdv: number; // critically-damaged device (0 = none)
  critdm: number; // ×10 device damage
  vfrom: number;
  hfrom: number;
  vto: number;
  hto: number;
  klflg: number; // 2 = hittee killed
  shcnfr: number; // hitter shield condition
  shstfr: number; // hitter shield strength ×10
  shcnto: number; // hittee shield condition
  shstto: number; // hittee shield strength ×10
  shjump: number; // displacement flag
}

/** A radio message (the MAKMSG record): sender DISP code, recipient mask, and text body. */
export interface RadioMessage {
  dispfr: number; // sender DISP code (0 = system/Romulan broadcast)
  recipients: number; // dbits at send time (for the "to ..." render)
  body: string;
}

/**
 * Per-recipient queue caps. Source uses 40-entry hit band + 32-entry msg band per player
 * (the `/hiseg/` queue blocks); the bounded ring with oldest-overwrite is observable under
 * flood (rapid combat/spam) but invisible otherwise.
 */
export const HIT_QUEUE_MAX = 40;
export const MSG_QUEUE_MAX = 32;

export class MessageBus {
  readonly #hits: HitEvent[][];
  readonly #msgs: RadioMessage[][];

  constructor() {
    this.#hits = Array.from({ length: KNPLAY + 1 }, () => []);
    this.#msgs = Array.from({ length: KNPLAY + 1 }, () => []);
  }

  /** Enqueue an event to every recipient whose identity bit is set in `dbits`. Oldest-overwrites at HIT_QUEUE_MAX. */
  makeHit(event: HitEvent, dbits: number): void {
    for (let i = 1; i <= KNPLAY; i++) {
      if ((dbits & (1 << (i - 1))) === 0) continue;
      const q = this.#hits[i]!;
      if (q.length >= HIT_QUEUE_MAX) q.shift(); // drop oldest to make room
      q.push({ ...event });
    }
  }

  hasHits(who: number): boolean {
    return who >= 1 && who <= KNPLAY && this.#hits[who]!.length > 0;
  }

  /** Remove and return all pending hit events for `who` (drained at a boundary). */
  drainHits(who: number): HitEvent[] {
    if (who < 1 || who > KNPLAY) return [];
    const q = this.#hits[who]!;
    this.#hits[who] = [];
    return q;
  }

  /** Enqueue a radio message to every recipient in `dbits`. Oldest-overwrites at MSG_QUEUE_MAX. */
  makeMsg(msg: RadioMessage, dbits: number): void {
    for (let i = 1; i <= KNPLAY; i++) {
      if ((dbits & (1 << (i - 1))) === 0) continue;
      const q = this.#msgs[i]!;
      if (q.length >= MSG_QUEUE_MAX) q.shift();
      q.push({ ...msg });
    }
  }

  hasMsgs(who: number): boolean {
    return who >= 1 && who <= KNPLAY && this.#msgs[who]!.length > 0;
  }

  drainMsgs(who: number): RadioMessage[] {
    if (who < 1 || who > KNPLAY) return [];
    const q = this.#msgs[who]!;
    this.#msgs[who] = [];
    return q;
  }
}

/**
 * PRIDIS recipient mask — the Chebyshev box. Returns the OR of `bits[i]` for every actively
 * playing ship within `ilim` sectors (king-move) of (iV,iH) on the selected side. Callers OR
 * several PRIDIS results together (the original's `zero` union) and add `bits[firer]`.
 *
 * @param iflag 0 = all sides, 1 = Federation (1–9), 2 = Empire (10–18).
 */
export function pridis(
  state: GameState,
  iV: number,
  iH: number,
  ilim: number,
  iflag: 0 | 1 | 2,
): number {
  let lo = 1;
  let hi = KNPLAY;
  if (iflag === 1) hi = KNPLAY / 2; // 9
  if (iflag === 2) lo = KNPLAY / 2 + 1; // 10
  let mask = 0;
  for (let i = lo; i <= hi; i++) {
    if ((state.alive[i] ?? 0) >= 0) continue; // only actively-playing ships (alive < 0)
    const s = state.ships[i];
    if (s && ldis(iV, iH, s.vPos, s.hPos, ilim)) mask |= state.bits[i] ?? 0;
  }
  return mask;
}
