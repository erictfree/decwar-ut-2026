/**
 * TIME — display the various game clocks.
 *
 * Source: `DECWAR.FOR:4076–4094` (subroutine TIME); strings `MSG.MAC:330–339`. Classification:
 * Preserve exactly (output is product text). The OTIM `HH:MM:SS` formatter lives in
 * `runtime/clock.ts`.
 *
 * Five lines:
 *   • Game's elapsed time  — `clock.monotonic() - state.tim0`
 *   • Ship's elapsed time  — `clock.monotonic() - session.jobtm`  (in-game only; line skipped pre-game)
 *   • Run time in game     — `runtim(d) - job(who, KRUNTM)` (TOPS-10 CPU time; no portable analog → 0)
 *   • Job's total run time — `runtim(d)` (same → 0)
 *   • Current time of day  — `daytim(d)` (ms within today)
 *
 * The two CPU-time fields show 00:00:00; faithful spec preservation of the labels is what
 * matters here. (Phase G fidelity polish may surface a synthetic process-CPU number if needed.)
 */
import { CRLF } from "../render/output.ts";
import { TIME01, TIME02, TIME03, TIME04, TIME05 } from "../render/strings.ts";
import { otim, daytim } from "../runtime/clock.ts";
import type { GameState } from "../core/state.ts";
import type { Session } from "../core/session.ts";

export function time(state: GameState, session: Session): void {
  const mono = state.clock.monotonic();
  let out = "";
  out += TIME01 + otim(mono - state.tim0);
  if (session.who !== 0) {
    out += TIME02 + otim(mono - session.jobtm);
    out += TIME03 + otim(0); // KJOBTM/KRUNTM CPU timer — no portable analog
  }
  out += TIME04 + otim(0); // runtim(d) CPU total — same
  out += TIME05 + otim(daytim(state.clock));
  out += CRLF;
  session.io.write(out);
}
