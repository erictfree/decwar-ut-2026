/**
 * DECWAR random number generator — a seedable multiplicative congruential generator on the
 * PDP-10 36-bit word.
 *
 * Source (verified verbatim during planning): `WARMAC.MAC:2684–2725`.
 * Classification: Preserve exactly (REQ-FIXED-003/004).
 *
 * The MACRO-10 core, reproduced instruction-for-instruction below:
 *
 *   setran: skipn t1,@0(arg)   ; seed given (nonzero)?
 *           mstime t1,         ;   no — seed from the ms run-time clock
 *           movem t1,seed
 *
 *   iran:   pushj p,ran.       ; quotient in t0, remainder in t1
 *           idiv  t0,@0(arg)   ; quotient/n -> t0, remainder -> t1
 *           movei t0,1(t1)     ; result = remainder + 1   ∈ [1, n]
 *
 *   ran:    pushj p,ran.
 *           fsc   t0,200       ; float the quotient into [0,1)  (see OQ-9 below)
 *
 *   ran.:   move  t1,seed
 *           trnn  t1,-1        ; any of the low 18 bits set?  skip if so
 *           hrri  t1,^D260543  ;   none — set the low 18 bits to 260543 (prime < 2^18)
 *           imuli t1,^D260543  ; t1 = low 36 bits of (t1 * 260543)
 *           tlz   t1,400000    ; clear the sign bit -> force non-negative
 *           movem t1,seed
 *           move  t0,t1
 *           idivi t0,^D257     ; quotient = seed/257 (257 = first prime > 2^8)
 *
 * Implementation notes:
 *   • The recurrence runs on BigInt masked to 36 bits, so the multiply and sign-clear are
 *     bit-exact (a Number multiply would land within ~0.6% of MAX_SAFE_INTEGER — too close).
 *   • The quotient is always < 2^27 (max = floor((2^35-1)/257) = 133695480 < 134217728), so
 *     ran()'s `/2^27` is exact in IEEE-754 double and lands in [0,1).
 *   • OQ-9 (the exact `fsc t0,200` mapping): reasoning resolves it to quotient × 2^(128-128-27)
 *     = quotient / 2^27 (the integer occupies the float mantissa field; fsc adds 128 to the
 *     exponent, normalizing to the value q/2^27). This is exact, but it is kept isolated
 *     behind `ran()` so it can be swapped if SIMH experiment E3 ever shows otherwise.
 *
 * DRAW ORDER IS GAME STATE. This class is *only* the stream. The load-bearing per-routine
 * draw order (e.g. TORDAM draws ran() 3× before computing the hit; MOVE draws iran(4000)
 * before moving) is the responsibility of the command handlers built in a later increment —
 * not enforced here. Given the same seed and the same sequence of iran/ran calls, two Rng
 * instances produce identical streams.
 */

const MASK36 = (1n << 36n) - 1n;
const SIGN_BIT = 1n << 35n; // PDP-10 word sign bit (cleared by `tlz t1,400000`)
const LOW18_MASK = (1n << 18n) - 1n; // the low 18 bits tested by `trnn t1,-1`
const HI18_KEEP = MASK36 ^ LOW18_MASK; // mask that preserves the high 18 bits (for hrri)
const NO_SIGN = MASK36 ^ SIGN_BIT; // mask that clears the sign bit (for tlz)
const MULT = 260543n; // the multiplier / low-bit fill (^D260543)
const DIV = 257n; // the quotient divisor (^D257)
const RAN_SCALE = 2 ** 27; // ran() float scale (fsc t0,200 ⇒ /2^27)

/** A clock returning milliseconds; used only to seed when `setran(0)` is requested. */
export type MsClock = () => number;

export class Rng {
  #seed: bigint = 0n;
  readonly #clock: MsClock;

  /**
   * @param seed  nonzero => deterministic; 0 (or omitted) => seeded from the clock.
   * @param clock injectable ms clock (default `Date.now`) used only for the zero-seed case.
   */
  constructor(seed = 0, clock: MsClock = Date.now) {
    this.#clock = clock;
    this.setran(seed);
  }

  /**
   * SETRAN: install a seed. A nonzero seed is used directly (deterministic); a zero seed is
   * replaced by the millisecond clock (`mstime`), exactly as the original.
   */
  setran(seed: number): void {
    let s = BigInt(Math.trunc(seed)) & MASK36;
    if (s === 0n) s = BigInt(Math.trunc(this.#clock())) & MASK36;
    this.#seed = s;
  }

  /** The `ran.` core: advance the seed and return the quotient (seed/257). */
  #advance(): bigint {
    let t1 = this.#seed;
    if ((t1 & LOW18_MASK) === 0n) {
      t1 = (t1 & HI18_KEEP) | MULT; // hrri t1,^D260543 (low 18 bits had no bits set)
    }
    t1 = (t1 * MULT) & MASK36; // imuli t1,^D260543 (keep low 36 bits)
    t1 = t1 & NO_SIGN; // tlz t1,400000 (clear sign bit)
    this.#seed = t1; // movem t1,seed
    return t1 / DIV; // idivi t0,^D257 -> quotient
  }

  /**
   * IRAN(n): a uniform integer in [1, n] inclusive. Equivalent to `mod(ran., n) + 1`.
   * @throws RangeError if n is not a positive integer.
   */
  iran(n: number): number {
    if (!Number.isInteger(n) || n <= 0) {
      throw new RangeError(`iran(n): n must be a positive integer, got ${n}`);
    }
    const quotient = this.#advance();
    return Number(quotient % BigInt(n)) + 1;
  }

  /** RAN(): a uniform float in [0, 1). See the OQ-9 note in the file header. */
  ran(): number {
    const quotient = this.#advance();
    return Number(quotient) / RAN_SCALE;
  }

  /**
   * Capture the current 36-bit seed so a golden transcript can be reproduced from this exact
   * point. The seed stays well below 2^35, so a JS number represents it exactly.
   */
  seedSnapshot(): number {
    return Number(this.#seed);
  }

  /** Restore a seed captured by {@link seedSnapshot} (raw set; does not apply zero→clock). */
  loadSnapshot(snapshot: number): void {
    this.#seed = BigInt(Math.trunc(snapshot)) & MASK36;
  }
}
