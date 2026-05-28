/**
 * Player activation and FREE — the lifecycle commit/teardown.
 *
 * Source: `SETUP.FOR:194–467` (SETUP/commit), `DECWAR.FOR:48–49` (PLACE the ship),
 * `FREE 1076–1133`; analysis Deliverable #10 §2.3–2.5/§7.2. Classification: Preserve
 * semantically.
 *
 * `activate` is the synchronous commit step: numply/numsid/numshp bookkeeping, fresh ship
 * stats, PLACE, group setup. The interactive opt-in / side / ship-selection prompts (the
 * SETUP.FOR `setu02..18` cascade and `kqsrch` reincarnation logic) live in
 * `lifecycle/setup.ts:runSetup`, which calls this with explicit `{team, who}` hints.
 * When the hints are omitted, this falls back to "auto-assign smaller fleet, first free
 * slot" — the simplified path used by tests and Increment 3a code.
 */
import { newlyActivatedShip } from "../core/state.ts";
import { KNPLAY, KNDEV, KNPOIN, KQLEN, TEAM, DX } from "../core/constants.ts";
import { GROUP_NAMES } from "../render/strings.ts";
import { buildUniverse, shouldRebuildUniverse, resetHighSegment } from "./universe.ts";
import { place } from "./place.ts";
import { upsertEntry } from "../persistence/honorRoll.ts";
import type { HonorEntry } from "../persistence/honorRoll.ts";
import type { GameState } from "../core/state.ts";
import type { Session } from "../core/session.ts";

const ALL_MASK = (1 << KNPLAY) - 1; // bits 1..18
const FED_MASK = (1 << (KNPLAY / 2)) - 1; // bits 1..9
const EMP_MASK = ALL_MASK ^ FED_MASK; // bits 10..18

/** Populate the 7 standard TELL groups for this player (FRIENDLY/ENEMY relative to its team). */
function setupGroups(session: Session): void {
  const friendly = session.team === TEAM.FED ? FED_MASK : EMP_MASK;
  const enemy = session.team === TEAM.FED ? EMP_MASK : FED_MASK;
  // index: 1 ALL, 2 KLINGON, 3 EMPIRE, 4 HUMAN, 5 FEDERATION, 6 FRIENDLY, 7 ENEMY
  const masks = [0, ALL_MASK, EMP_MASK, EMP_MASK, FED_MASK, FED_MASK, friendly, enemy];
  session.groups = GROUP_NAMES.map((name, i) => ({ name, mask: masks[i] ?? 0 }));
  session.ngroup = 7;
}

export interface ActivateResult {
  ok: boolean;
  full: boolean;
  who: number;
  team: 1 | 2;
}

/** Optional caller-driven side/ship choice. When omitted, activate auto-assigns. */
export interface ActivateOptions {
  team?: 1 | 2;
  who?: number;
}

const HIGH_SEG_GRACE_MS = 300000; // 5 minutes (hitime)

export function freeSlot(state: GameState, team: 1 | 2): number {
  const lo = team === TEAM.FED ? 1 : 10;
  const hi = team === TEAM.FED ? 9 : 18;
  for (let i = lo; i <= hi; i++) if ((state.alive[i] ?? 0) > 0) return i; // alive 1 = available
  return 0;
}

export function activate(state: GameState, session: Session, opts: ActivateOptions = {}): ActivateResult {
  if (state.numply >= KNPLAY) return { ok: false, full: true, who: 0, team: TEAM.FED };

  state.numply++;
  if (shouldRebuildUniverse(state)) {
    // First-ever player → fresh build. Or: previous game ended (endflg=-2) / the 5-min
    // hitime grace expired with no surviving players. Either way, wipe the previous
    // game's high-segment state and re-roll the universe (source SETUP.FOR:200–215).
    if (state.built) resetHighSegment(state);
    buildUniverse(state);
    state.built = true;
    state.tim0 = state.clock.monotonic(); // game-start time stamp (source: tim0 set on build)
  }

  // Choose side: caller-supplied, else auto-assign to the smaller fleet (Fed on a tie).
  let team: 1 | 2 =
    opts.team !== undefined
      ? opts.team
      : (state.numsid[2] ?? 0) < (state.numsid[1] ?? 0)
        ? TEAM.EMP
        : TEAM.FED;
  let who = opts.who ?? freeSlot(state, team);
  // If the caller's hint is no longer available (a race with another joiner), fall back.
  if (who === 0 || (state.alive[who] ?? 0) <= 0) {
    who = freeSlot(state, team);
  }
  if (who === 0) {
    // Side full — fall back to the other side only when the caller didn't pin a team.
    if (opts.team === undefined) {
      team = team === TEAM.FED ? TEAM.EMP : TEAM.FED;
      who = freeSlot(state, team);
    }
  }
  if (who === 0) {
    state.numply--; // no slot available after all
    return { ok: false, full: true, who: 0, team: TEAM.FED };
  }

  // Commit (SETUP 2500): counters, fresh ship stats, reserve the slot.
  state.numsid[team] = (state.numsid[team] ?? 0) + 1;
  state.numshp[team] = (state.numshp[team] ?? 0) + 1;
  state.ships[who] = newlyActivatedShip();
  const dev = state.devices[who];
  if (dev) for (let d = 1; d <= KNDEV; d++) dev[d] = 0;
  state.alive[who] = -1; // playing (.TRUE.)

  // PLACE the ship on the board (keeps clear of enemy territory).
  const code = (team === TEAM.FED ? DX.FSHP : DX.ESHP) * 100 + who;
  const c = place(state, code, 1);
  const ship = state.ships[who]!;
  ship.vPos = c.v;
  ship.hPos = c.h;

  session.who = who;
  session.team = team;
  session.player = true;
  session.jobtm = state.clock.monotonic(); // mark when this session activated (job(who,KJOBTM))
  setupGroups(session);

  // Restore the captain name from the persisted honor roll, if any (so a returning player
  // who set their name in an earlier life doesn't have to re-type it). Match by identity
  // across both sides — captain name is per-player, not per-team. A `SET NAME` in this
  // session will then override the persisted value.
  if (session.identity && !session.captain) {
    const roll = state.honor.load();
    const found = [...roll.fed, ...roll.emp].find((e) => e.identity === session.identity);
    if (found) session.captain = found.captain;
  }

  return { ok: true, full: false, who, team };
}

/**
 * Total accumulated points for `who` (sum across the 8 KNPOIN categories), in plain integer
 * points (the source's ×10 Tenths divided by 10 and truncated — matches the honor-roll
 * display at WARMAC.MAC `dspsta`).
 */
export function playerTotalPoints(state: GameState, who: number): number {
  let total = 0;
  for (let i = 1; i <= KNPOIN; i++) {
    total += state.score[i]?.[who] ?? 0;
  }
  return Math.trunc(total / 10);
}

/**
 * UPDSTA — write the dying/quitting player's stats into the persistent honor roll
 * (WARMAC.MAC:5556 `updsta`). The source has two parallel records (living high-rollers vs
 * fallen captains); the port uses one `HonorEntry` per (identity, ship) with an `alive`
 * flag, then `upsertEntry` sorts by score and caps at KNSTAT (5) per side. Called from
 * `freeShip` before counters/positions are cleared, so `session.team`/`who` are still
 * authoritative.
 *
 * `alive` = `true` when the player left while still alive (quit, hangup); `false` when
 * they actually died (energy ≤ 0 or damage ≥ KENDAM). The caller in `freeShip` infers
 * this from the ship state.
 */
function updsta(state: GameState, session: Session, alive: boolean): void {
  const who = session.who;
  if (who <= 0) return;
  const score = playerTotalPoints(state, who);
  if (score <= 0 && session.captain === "") return; // nothing worth recording
  const entry: HonorEntry = {
    identity: session.identity,
    captain: session.captain,
    ship: who,
    score,
    alive,
    recordedAt: state.clock.now(),
  };
  const roll = state.honor.load();
  upsertEntry(roll, session.team, entry);
  state.honor.save(roll);
}

/**
 * KQSRCH — locate this connection's previous kill-queue record, if any (DECWAR.FOR:1325–1348).
 * The source matches on (ttynum, jobnum, ppn); the port matches on the per-session `identity`
 * string. Returns the 1-based slot index (`kindex`), or 0 if not found / no identity set.
 */
export function kqsrch(state: GameState, identity: string): number {
  if (!identity || state.nkill === 0) return 0;
  for (let i = 1; i <= state.nkill; i++) {
    if (state.kilque[i]?.identity === identity) return i;
  }
  return 0;
}

/**
 * KQADD — record (or update) a kill-queue entry for this connection. Mirrors the round-robin
 * insertion in DECWAR.FOR:1094–1107: existing slot for this identity is overwritten;
 * otherwise advance `kilndx` (wrap at KQLEN), grow `nkill` up to KQLEN.
 */
function kqadd(state: GameState, identity: string, team: 1 | 2, who: number, deathMs: number): void {
  if (!identity) return; // no identity → not trackable (e.g. unscripted tests)
  let kindex = kqsrch(state, identity);
  if (kindex === 0) {
    if (state.nkill < KQLEN) state.nkill++;
    state.kilndx++;
    if (state.kilndx > KQLEN) state.kilndx = 1;
    kindex = state.kilndx;
  }
  const rec = state.kilque[kindex];
  if (rec) {
    rec.identity = identity;
    rec.deathMs = deathMs;
    rec.team = team;
    rec.who = who;
  }
}

/**
 * FREE — release a ship on quit/death/hangup: write the honor-roll entry (UPDSTA), record
 * the kill-queue entry (KQADD), clear the board cell, recycle the slot (`alive=1`),
 * decrement counts, and start the 5-minute high-segment grace if the last player has left.
 *
 * `dead` distinguishes "died in combat" from "quit while alive" — it routes the honor-roll
 * entry into the right category (Golden Galaxy Medal vs Emerald Star Cluster). The runtime
 * loop infers this from the ship state (`energy ≤ 0 || damage ≥ KENDAM`) and passes it in.
 */
export function freeShip(state: GameState, session: Session, dead = false): void {
  const who = session.who;
  if (who <= 0) return;

  // UPDSTA before counters move (we still need session.team / score; source updsta also
  // fires from within FREE — WARMAC.MAC:5556).
  updsta(state, session, !dead);

  // KQADD before counters move (source DECWAR.FOR:1094–1107 fires inside FREE).
  kqadd(state, session.identity, session.team, who, state.clock.monotonic());

  const ship = state.ships[who];
  if (ship) state.board.setdsp(ship.vPos, ship.hPos, DX.MPTY * 100); // clear cell → 0
  state.alive[who] = 1; // available again
  state.numply = Math.max(0, state.numply - 1);
  const team = session.team;
  state.numsid[team] = Math.max(0, (state.numsid[team] ?? 0) - 1);
  if (state.numply === 0 && state.endflg === 0) {
    state.hitime = state.clock.now() + HIGH_SEG_GRACE_MS; // preserve the galaxy for 5 minutes
  }
  session.who = 0;
}
