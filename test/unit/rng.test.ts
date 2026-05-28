/**
 * Tests for the seedable RNG. Pinned to WARMAC.MAC:2684–2725 and Deliverable #6 §0.2.
 *
 * The golden values below were captured from this implementation and cross-checked by hand
 * for seed=1: the first draw multiplies 1×260543 = 260543 (no sign/low-bit adjustment),
 * quotient = 260543/257 = 1013, so iran(1000) = 1013 mod 1000 + 1 = 14 and
 * ran() = 1013 / 2^27 = 0.00000754743… — both confirmed below.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Rng } from "../../src/core/rng.ts";

test("hand-checked first draw for seed=1", () => {
  assert.equal(new Rng(1).iran(1000), 14);
  assert.equal(new Rng(1).ran(), 1013 / 2 ** 27);
});

test("golden iran(1000) stream for seed=1 (regression oracle)", () => {
  const r = new Rng(1);
  const seq = Array.from({ length: 8 }, () => r.iran(1000));
  assert.deepEqual(seq, [14, 364, 256, 480, 348, 275, 684, 343]);
});

test("golden ran() stream for seed=1 (regression oracle)", () => {
  const r = new Rng(1);
  const seq = Array.from({ length: 5 }, () => r.ran());
  assert.deepEqual(seq, [
    0.000007547438144683838, 0.9718489870429039, 0.5454514548182487,
    0.6879454776644707, 0.5311991795897484,
  ]);
});

test("a fixed seed is fully deterministic", () => {
  const a = new Rng(12345);
  const b = new Rng(12345);
  for (let i = 0; i < 200; i++) assert.equal(a.iran(37), b.iran(37));
});

test("iran(n) stays within [1, n]", () => {
  const r = new Rng(98765);
  for (let i = 0; i < 5000; i++) {
    const x = r.iran(6);
    assert.ok(x >= 1 && x <= 6, `iran(6) out of range: ${x}`);
  }
});

test("iran(n) covers the whole [1, n] range", () => {
  const r = new Rng(424242);
  const seen = new Set<number>();
  for (let i = 0; i < 5000; i++) seen.add(r.iran(6));
  for (let v = 1; v <= 6; v++) assert.ok(seen.has(v), `value ${v} never drawn`);
});

test("ran() stays within [0, 1)", () => {
  const r = new Rng(55);
  for (let i = 0; i < 5000; i++) {
    const x = r.ran();
    assert.ok(x >= 0 && x < 1, `ran() out of range: ${x}`);
  }
});

test("iran() rejects non-positive / non-integer n", () => {
  const r = new Rng(1);
  assert.throws(() => r.iran(0), RangeError);
  assert.throws(() => r.iran(-3), RangeError);
  assert.throws(() => r.iran(2.5), RangeError);
});

test("zero seed uses the injected clock; equals the explicit-seed stream", () => {
  const clocked = new Rng(0, () => 42);
  const explicit = new Rng(42);
  for (let i = 0; i < 50; i++) assert.equal(clocked.iran(100), explicit.iran(100));
});

test("seedSnapshot()/loadSnapshot() resume an identical stream", () => {
  const live = new Rng(7777);
  for (let i = 0; i < 10; i++) live.iran(50); // advance
  const snap = live.seedSnapshot();

  const resumed = new Rng();
  resumed.loadSnapshot(snap);
  for (let i = 0; i < 25; i++) {
    assert.equal(resumed.iran(50), live.iran(50));
  }
});
