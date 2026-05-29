// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * A scriptable, socket-free TelnetIO for driving the read-eval loop in tests. It feeds a fixed
 * list of input lines and captures all output. (Deliverable #13 §14: scriptable sessions.)
 *
 * The scripted lines should end with a command that terminates the loop (e.g. QUIT); once the
 * lines are exhausted, readCommandLine reports hangup so runSession returns rather than spinning
 * on the idle heartbeat.
 */
import type { TelnetIO } from "../../src/core/session.ts";

export class ScriptedIo implements TelnetIO {
  terwid = 80;
  output = "";
  hungUp = false;
  /** Total ms of `pause()` calls (instant in tests; inspect for cooldown/pacing assertions). */
  pausedMs = 0;
  /** Mirror of the real IO's hook; the test wires this to set `session.hungup`. */
  onHangup: (() => void) | null = null;
  /** Mirror of the real IO's ^C hook; the runtime wires this to set `session.ccflg`. */
  onCtrlC: (() => void) | null = null;

  /** Test-only: synthesize an in-band ^C. Fires the onCtrlC hook. */
  signalCtrlC(): void {
    this.onCtrlC?.();
  }
  readonly #lines: string[];

  constructor(lines: string[]) {
    this.#lines = [...lines];
  }

  write(text: string): void {
    this.output += text;
  }

  pause(ms: number): Promise<void> {
    if (ms > 0) this.pausedMs += ms;
    return Promise.resolve();
  }

  readCommandLine(_timeoutMs: number): Promise<string | null> {
    const next = this.#lines.shift();
    if (next === undefined) {
      // no more script → behave like a hangup so the loop exits rather than spinning on the
      // idle heartbeat. onHangup runs synchronously, before the awaiting loop resumes.
      this.hungUp = true;
      this.onHangup?.();
      return Promise.resolve(null);
    }
    return Promise.resolve(next);
  }

  close(): void {
    this.hungUp = true;
  }
}
