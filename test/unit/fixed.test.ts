/**
 * Tests for the ×10 fixed-point helpers. Pinned to OFLT behavior (WARMAC.MAC:2305–2337) and
 * Deliverable #6 §0.1.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  whole,
  frac,
  truncToTenths,
  renderTenths,
  renderSignedTenths,
} from "../../src/core/fixed.ts";

test("whole() is the OFLT integer part (idivi by 10)", () => {
  assert.equal(whole(48750), 4875); // 4875.0
  assert.equal(whole(20005), 2000); // 2000.5
  assert.equal(whole(0), 0);
  assert.equal(whole(9), 0); // 0.9
  assert.equal(whole(-15), -1); // truncates toward zero
});

test("frac() is the single fractional digit (abs remainder)", () => {
  assert.equal(frac(48750), 0);
  assert.equal(frac(20005), 5);
  assert.equal(frac(9), 9);
  assert.equal(frac(-15), 5);
});

test("truncToTenths() truncates toward zero, never rounds", () => {
  assert.equal(truncToTenths(409.9), 409);
  assert.equal(truncToTenths(409.1), 409);
  assert.equal(truncToTenths(-409.9), -409); // toward zero, not -410
  assert.equal(truncToTenths(0.99), 0);
});

test("renderTenths() matches OFLT long form and short truncation", () => {
  assert.equal(renderTenths(48750), "4875.0");
  assert.equal(renderTenths(20005), "2000.5");
  assert.equal(renderTenths(48750, { short: true }), "4875"); // short omits the fraction
  assert.equal(renderTenths(20005, { short: true }), "2000");
});

test("renderSignedTenths() matches OSFLT explicit sign", () => {
  assert.equal(renderSignedTenths(1000), "+100.0"); // shields up
  assert.equal(renderSignedTenths(-1000), "-100.0"); // shields down
  assert.equal(renderSignedTenths(1000, { short: true }), "+100");
  assert.equal(renderSignedTenths(-1000, { short: true }), "-100");
});
