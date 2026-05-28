/**
 * Tests for GameState construction. Pinned to SETUP.FOR:460–465 (ship init), Deliverable #5
 * §3.1, and the bits[11..18] correction (Deliverable #5 §6 Q1, #12 §2.1).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createInitialGameState,
  newlyActivatedShip,
} from "../../src/core/state.ts";
import { KNPLAY, KNDEV, COND, SHIELD } from "../../src/core/constants.ts";

test("bits[i] = 2^(i-1) for ALL 18 slots (corrects the source 1..10-only init)", () => {
  const g = createInitialGameState();
  for (let i = 1; i <= KNPLAY; i++) {
    assert.equal(g.bits[i], 2 ** (i - 1), `bits[${i}]`);
  }
  // The reconstruction source DATA-inits only bits(1..10); slots 11..18 would have been 0,
  // blacking out half the Empire. The port fixes this — assert the upper half is nonzero.
  for (let i = 11; i <= KNPLAY; i++) {
    assert.notEqual(g.bits[i], 0, `bits[${i}] must be nonzero in the 18-player port`);
  }
  assert.equal(g.bits[14], 8192); // 2^13 — the canonical regression slot
  assert.equal(g.bits[18], 131072); // 2^17 — the last Empire ship
});

test("newlyActivatedShip() matches SETUP.FOR activation values", () => {
  const s = newlyActivatedShip();
  assert.equal(s.energy, 50000); // 5000.0
  assert.equal(s.shieldPct, 1000); // 100.0%
  assert.equal(s.torps, 10);
  assert.equal(s.lifeSupport, 5);
  assert.equal(s.damage, 0);
  assert.equal(s.condition, COND.GREEN);
  assert.equal(s.shieldCond, SHIELD.UP);
});

test("a fresh world is zeroed and seeded", () => {
  const g = createInitialGameState();
  assert.equal(g.ships.length, KNPLAY + 1); // 1-based with placeholder slot 0
  assert.equal(g.devices.length, KNPLAY + 1);
  assert.equal(g.devices[1]?.length, KNDEV + 1);
  assert.equal(g.nplnet, 0);
  assert.equal(g.numply, 0);
  assert.equal(g.version, 24);
  assert.equal(g.romopt, true);
  assert.equal(g.slwest, 1);
  // every ship slot is present (no sparse holes) and zeroed
  for (let i = 0; i <= KNPLAY; i++) {
    assert.equal(g.ships[i]?.energy, 0, `ship ${i} energy`);
  }
});

test("overloaded domains are preserved (not normalized to bool)", () => {
  const g = createInitialGameState();
  // endflg is multi-valued: -2 = total destruction (Deliverable #5 §11)
  g.endflg = -2;
  assert.equal(g.endflg, -2);
  // alive is a tri-state integer: 1 = freed-dead slot
  g.alive[3] = 1;
  assert.equal(g.alive[3], 1);
  // docked uses sign as a flag (<0 docked)
  g.docked[5] = -1;
  assert.ok((g.docked[5] ?? 0) < 0);
});
