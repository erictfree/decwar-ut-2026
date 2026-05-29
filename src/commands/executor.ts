// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 Eric Freeman and The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * Command executor — match the leading token against the in-game table and dispatch.
 *
 * Source: GETCMD/dispatch `DECWAR.FOR:1238–1272`, 57–59; analysis Deliverable #4 §1/§2.
 * Classification: Preserve exactly (matching/error semantics).
 *
 * THE INVARIANT (Deliverable #13 §1): handlers mutate shared state synchronously and never
 * `await` mid-mutation. `executeCommand` is async only so that handlers which prompt for a
 * missing argument (MOVE's "Coordinates:", and later SET/RADIO/TELL) can `await` at the read
 * seam BEFORE touching shared state — the original drops locks before that input too. The
 * loop's other await points are the command-read and the pacing pause.
 *
 * Implemented concretely: STATUS, QUIT, MOVE, IMPULSE. The other recognized commands print a
 * clearly-marked stub. Unknown/ambiguous matching is fully faithful.
 */
import { CRLF } from "../render/output.ts";
import { AMBCOM, UNKCOM, FORHLP, SURE00 } from "../render/strings.ts";
import { tokenize } from "../parser/tokenizer.ts";
import { equal } from "../parser/match.ts";
import { KCMDTM } from "../core/constants.ts";
import { IN_GAME_COMMANDS, CMD, matchCommand } from "./table.ts";
import { renderStatus } from "./status.ts";
import { move } from "./move.ts";
import { phasers } from "./phasers.ts";
import { torpedos } from "./torpedos.ts";
import { radio } from "./radio.ts";
import { tell } from "./tell.ts";
import { scan } from "./scan.ts";
import { damages } from "./damages.ts";
import { type as typeCmd } from "./type.ts";
import { users } from "./users.ts";
import { list as listCmd } from "./list.ts";
import { points } from "./points.ts";
import { shields } from "./shields.ts";
import { dock } from "./dock.ts";
import { repairCmd } from "./repair.ts";
import { energy } from "./energy.ts";
import { tractor } from "./tractor.ts";
import { build } from "./build.ts";
import { capture } from "./capture.ts";
import { time } from "./time.ts";
import { set } from "./set.ts";
import { help, news, gripe, debug } from "./help.ts";
import { password } from "./password.ts";
import { OFLG, TOK } from "../core/constants.ts";
import type { GameState } from "../core/state.ts";
import type { Session } from "../core/session.ts";

export interface ExecOutcome {
  action: "continue" | "quit";
  /** True for a completed time-consuming command (→ scheduler.postMove). */
  timeConsuming: boolean;
  /** Whether the post-move processing runs end-of-turn repair (3400 path: MOVE; 3500: weapons). */
  repair: boolean;
}

const cont = (timeConsuming = false, repair = true): ExecOutcome => ({
  action: "continue",
  timeConsuming,
  repair,
});

export async function executeCommand(
  state: GameState,
  session: Session,
): Promise<ExecOutcome> {
  const t = session.tokens;
  if (t.ntok < 1) return cont(); // empty line → nothing to do

  const keyword = t.text[1] ?? "";
  const { cmd, ambiguous } = matchCommand(keyword);
  const short = session.oflg === OFLG.SHORT;

  if (ambiguous || cmd === 0) {
    session.io.write(ambiguous ? AMBCOM : UNKCOM);
    if (!short) session.io.write(FORHLP);
    session.io.write(CRLF);
    return cont();
  }

  switch (cmd) {
    case CMD.STATUS: {
      let items: string[] | null = null;
      if (t.ntok >= 2 && t.type[2] !== TOK.KEOL) {
        items = [];
        for (let i = 2; i <= t.ntok; i++) {
          if (t.type[i] === TOK.KALF) items.push(t.text[i] ?? "");
        }
      }
      renderStatus(state, session, items);
      return cont();
    }
    case CMD.MOVE:
      return cont(await move(state, session, false), true); // 3400 path (repair)
    case CMD.IMPULSE:
      return cont(await move(state, session, true), true);
    case CMD.PHASERS:
      return cont(await phasers(state, session), false); // 3500 path (no repair)
    case CMD.TORPEDOS:
      return cont(await torpedos(state, session), false); // 3500 path (no repair)
    case CMD.RADIO:
      await radio(state, session);
      return cont();
    case CMD.TELL:
      await tell(state, session);
      return cont();
    case CMD.SCAN:
      scan(state, session, false);
      return cont();
    case CMD.SRSCAN:
      scan(state, session, true);
      return cont();
    case CMD.DAMAGES:
      damages(state, session);
      return cont();
    case CMD.TYPE:
      await typeCmd(state, session, 0);
      return cont();
    case CMD.USERS:
      users(state, session);
      return cont();
    case CMD.LIST:
      listCmd(state, session, "LIST");
      return cont();
    case CMD.SUMMARY:
      listCmd(state, session, "SUMMARY");
      return cont();
    case CMD.BASES:
      listCmd(state, session, "BASES");
      return cont();
    case CMD.PLANETS:
      listCmd(state, session, "PLANETS");
      return cont();
    case CMD.TARGETS:
      listCmd(state, session, "TARGETS");
      return cont();
    case CMD.POINTS:
      points(state, session);
      return cont();
    case CMD.SHIELDS:
      await shields(state, session);
      return cont();
    case CMD.DOCK:
      return cont(dock(state, session), true); // 3400 path (end-of-turn repair)
    case CMD.REPAIR:
      return cont(repairCmd(state, session), false); // 3500 path (skip end-of-turn double-repair)
    case CMD.ENERGY:
      await energy(state, session);
      return cont();
    case CMD.TRACTOR:
      await tractor(state, session);
      return cont();
    case CMD.BUILD:
      return cont(await build(state, session), true); // 3400 path (end-of-turn repair)
    case CMD.CAPTURE:
      return cont(await capture(state, session), true); // 3400 path
    case CMD.TIME:
      time(state, session);
      return cont();
    case CMD.SET:
      await set(state, session);
      return cont();
    case CMD.HELP:
      help(state, session);
      return cont();
    case CMD.NEWS:
      news(state, session);
      return cont();
    case CMD.GRIPE:
      await gripe(state, session);
      return cont();
    case CMD.DEBUG:
      debug(state, session);
      return cont();
    case CMD.PASSWORD:
      password(session);
      return cont();
    case CMD.QUIT: {
      // Source DECWAR.FOR:135–141: hangup skips the confirm; otherwise prompt `sure00` and only
      // quit on `YES`. ccflg cleared + input buffer zapped before re-reading (deferred to
      // E-3b ^C state machine; for now we just await one fresh line).
      if (session.hungup) {
        session.io.write(`${CRLF}Goodbye.${CRLF}`);
        return { action: "quit", timeConsuming: false, repair: false };
      }
      session.io.write(SURE00);
      let line: string | null = null;
      while (line === null && !session.hungup) {
        line = await session.io.readCommandLine(KCMDTM);
      }
      if (session.hungup || line === null) return { action: "quit", timeConsuming: false, repair: false };
      const toks = tokenize(line, 0).tokens;
      if (equal(toks.text[1] ?? "", "YES") !== 0) {
        session.io.write(`${CRLF}Goodbye.${CRLF}`);
        return { action: "quit", timeConsuming: false, repair: false };
      }
      // Not confirmed → fall back to the prompt loop.
      return cont();
    }
    default: {
      const name = IN_GAME_COMMANDS[cmd] ?? "";
      session.io.write(
        `${CRLF}(${name} is recognized but not implemented in this build.)${CRLF}`,
      );
      return cont();
    }
  }
}
