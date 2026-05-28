/**
 * REPAIR (command form) — repair damaged ship devices, accelerated when docked.
 *
 * Source: `DECWAR.FOR:3177–3209` (subroutine REPAIR). Classification: Preserve exactly. Zero
 * RNG draws. The same subroutine serves the end-of-turn path (mode 3, size 300) — that path
 * is driven by `runtime/scheduler.ts repair()` and is unchanged.
 *
 * Mode selection (source 3182–3186): docked (`docked[who] < 0`) → mode 2 (size 1000);
 * else mode 1 (size 500). Mode 3 (size 300) is end-of-turn only and never reached here.
 *
 * Repsiz selection (source 3187–3198, after the standard mode default):
 *   • If token 2 is KINT → `repsiz = vallst(2) * 10` (the player's explicit raw amount, ×10).
 *   • Else if token 2 is the `ALL` keyword → `repsiz = maxd` (repair the worst device fully).
 *   • Else keep the mode default.
 * Then `repsiz = min(repsiz, maxd)` (source 3196) — never repair more than the worst device.
 *
 * Action (source 3201–3203): subtract `repsiz` from every device, floor 0 (all 9 devices).
 *
 * Suffix (source 3205): if `tknlst(ntoken) == 'DAMAGE'`, append the device-damage report by
 * calling `damages()` directly.
 *
 * No-op: if `maxd == 0` (no device damage), skip ptime and the device subtraction — still
 * returns time-consuming = true (matches source: falls through to `return` at line 3208 with
 * ptime=v-etim=0-0=0 ⇒ `return 1` (non-time-consuming). We follow source: return false when
 * there's nothing to repair, true otherwise.
 */
import { CRLF } from "../render/output.ts";
import { equal } from "../parser/match.ts";
import { KNDEV, TOK } from "../core/constants.ts";
import { damages } from "./damages.ts";
import type { GameState } from "../core/state.ts";
import type { Session } from "../core/session.ts";

export function repairCmd(state: GameState, session: Session): boolean {
  const who = session.who;
  const dev = state.devices[who];
  if (!dev) return false;

  const docked = (state.docked[who] ?? 0) < 0;
  const mode: 1 | 2 = docked ? 2 : 1;
  let repsiz = mode === 1 ? 500 : 1000;
  let ntoken = 2;

  // Numeric override on token 2: REPAIR 50 → repsiz = 500.
  if (session.tokens.type[2] === TOK.KINT) {
    repsiz = (session.tokens.val[2] ?? 0) * 10;
    ntoken = 3;
  }

  // Compute maxd = worst-damaged device.
  let maxd = 0;
  for (let dx = 1; dx <= KNDEV; dx++) maxd = Math.max(maxd, dev[dx] ?? 0);

  // No damage → ptime=0 → return 1 (non-time-consuming). Source 3195: `if maxd==0 goto 600`.
  if (maxd === 0) {
    session.io.write(CRLF);
    return false;
  }

  // Clamp; ALL keyword overrides to the worst-device amount.
  repsiz = Math.min(repsiz, maxd);
  if (equal(session.tokens.text[2] ?? "", "ALL") !== 0) {
    repsiz = maxd;
    ntoken = 3;
  }

  // Apply the parallel device subtraction.
  for (let dx = 1; dx <= KNDEV; dx++) {
    dev[dx] = Math.max((dev[dx] ?? 0) - repsiz, 0);
  }

  // Pause budget — source DECWAR.FOR:3200: `v = etim + (repsiz*8)/l`.
  session.ptime += Math.trunc((repsiz * 8) / mode);

  session.io.write(CRLF);

  // Optional DAMAGE suffix — call the damages command directly. Source passes ntoken+1 so
  // the inner scan skips past the DAMAGE keyword (DECWAR.FOR:3205: `call damage(ntoken+1)`).
  if (
    session.tokens.type[ntoken] === TOK.KALF &&
    equal(session.tokens.text[ntoken] ?? "", "DAMAGE") !== 0
  ) {
    damages(state, session, ntoken + 1);
  }

  return true; // time-consuming
}
