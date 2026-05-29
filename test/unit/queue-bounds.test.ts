// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * MessageBus per-recipient queue caps with oldest-overwrite eviction.
 * Source: 40-entry hit band + 32-entry msg band per player (the /hiseg/ queue blocks).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MessageBus, HIT_QUEUE_MAX, MSG_QUEUE_MAX } from "../../src/comms/messageBus.ts";
import type { HitEvent, RadioMessage } from "../../src/comms/messageBus.ts";

function hit(n: number): HitEvent {
  return {
    iwhat: 1, dispfr: 0, dispto: 0, ihita: n, critdv: 0, critdm: 0,
    vfrom: 0, hfrom: 0, vto: 0, hto: 0, klflg: 0,
    shcnfr: 0, shstfr: 0, shcnto: 0, shstto: 0, shjump: 0,
  };
}

function msg(body: string): RadioMessage {
  return { dispfr: 0, recipients: 0, body };
}

test("HIT_QUEUE_MAX caps the hit queue; oldest is evicted on overflow", () => {
  const bus = new MessageBus();
  // Enqueue HIT_QUEUE_MAX + 5 events to recipient 1.
  for (let n = 1; n <= HIT_QUEUE_MAX + 5; n++) bus.makeHit(hit(n), 1);
  const out = bus.drainHits(1);
  assert.equal(out.length, HIT_QUEUE_MAX);
  // First entries (1..5) were evicted; remaining range is 6..(HIT_QUEUE_MAX+5).
  assert.equal(out[0]!.ihita, 6);
  assert.equal(out[HIT_QUEUE_MAX - 1]!.ihita, HIT_QUEUE_MAX + 5);
});

test("MSG_QUEUE_MAX caps the message queue; oldest is evicted on overflow", () => {
  const bus = new MessageBus();
  for (let n = 1; n <= MSG_QUEUE_MAX + 3; n++) bus.makeMsg(msg(`msg-${n}`), 1);
  const out = bus.drainMsgs(1);
  assert.equal(out.length, MSG_QUEUE_MAX);
  assert.equal(out[0]!.body, "msg-4");
  assert.equal(out[MSG_QUEUE_MAX - 1]!.body, `msg-${MSG_QUEUE_MAX + 3}`);
});

test("queue caps are per-recipient", () => {
  const bus = new MessageBus();
  // Recipient 1 gets a flood; recipient 2 gets a single event.
  for (let n = 1; n <= HIT_QUEUE_MAX + 10; n++) bus.makeHit(hit(n), 1);
  bus.makeHit(hit(999), 2);
  assert.equal(bus.drainHits(1).length, HIT_QUEUE_MAX);
  assert.equal(bus.drainHits(2).length, 1);
});
