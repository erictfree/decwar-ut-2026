/**
 * ROMSPK — "The Romulan speaks!" taunt broadcast.
 *
 * Source: `WARMAC.MAC:6196–6320` (`entry romspk`). The Romulan picks an audience
 * (iran(3) → all / Federation / Empire — or, in single-player mode, addresses one
 * specific captain) and builds a 4-part taunt:
 *
 *   <leadin> <adjective> <species> <object>[s]!
 *
 * The strings come straight from the source's parallel tables (6225–6262), preserved
 * verbatim. The node-name lookup at `rmgply` (6279–6320) is irrelevant in the TS port
 * (no TOPS-10 node names), so single-player taunts always use the `rmgprn` random-quip
 * fallback.
 *
 * RNG draws, in order (preserving source order — load-bearing):
 *   1. (broadcast only) iran(3) — audience selector
 *   2. iran(4) — leadin index
 *   3. iran(5) — adjective index
 *   4. (single only) iran(3), then if 33%-quip path declined: iran(5) — species index
 *   5. (broadcast only — implicit, indexed by audience) species
 *   6. iran(5) — object/noun index
 *
 * Routing: each taunt enqueues one RadioMessage via `state.bus.makeMsg`, with
 * `dispfr = DX.ROM * 100` so OUTMSG renders the sender as "Romulan" (OBJ_NAMES[5]).
 * Each recipient sees the message at their next drainMsgs heartbeat (≤KCMDTM).
 */
import { DX, TEAM, KNPLAY } from "../core/constants.ts";
import type { GameState } from "../core/state.ts";

const ALL_MASK = (1 << KNPLAY) - 1; // bits 1..18
const FED_MASK = (1 << (KNPLAY / 2)) - 1; // bits 1..9
const EMP_MASK = ALL_MASK ^ FED_MASK; // bits 10..18

const LEADIN_BROADCAST: readonly string[] = [
  "Death to ", "Destruction to ", "I will crush ", "Prepare to die, ",
];
const LEADIN_SINGLE: readonly string[] = [
  "You have aroused my wrath, ",
  "You will witness my vengence, ", // (source typo preserved verbatim)
  "May you be attacked by a slime-devil, ",
  "I will reduce you to quarks, ",
];

const ADJECTIVES: readonly string[] = [
  "mindless ", "worthless ", "ignorant ", "idiotic ", "stupid ",
];

/** Broadcast species table — indexed 1=all, 2=humans, 3=klingons (matches the audience). */
const SPECIES_BROADCAST: readonly string[] = ["sub-Romulan ", "human ", "klingon "];

/** Single-player random species (rmgprn fallback when no node-specific quip). */
const SPECIES_RANDOM: readonly string[] = [
  "sub-Romulan ", "vertebrate ", "endo-skeletal ", "soft-skinned ",
];

const OBJECTS: readonly string[] = ["mutant", "cretin", "toad", "worm", "parasite"];

/**
 * Pick the species used in a single-player taunt (source rmgprn, 6305–6319). With 1/5
 * probability use the team-based form ("human "/"klingon "); otherwise pick from
 * SPECIES_RANDOM. `team` is the target's team. Source draws iran(5) and dispatches.
 */
function singleSpecies(rng: GameState["rng"], team: 1 | 2): string {
  const draw = rng.iran(5);
  if (draw === 5) {
    return team === TEAM.FED ? "human " : "klingon ";
  }
  // draw 1..4 → SPECIES_RANDOM[0..3] (the source's `sos t1,0` decrements then indexes)
  return SPECIES_RANDOM[draw - 1] ?? SPECIES_RANDOM[0]!;
}

/**
 * Broadcast taunt (multi-player). Source rmspk path at 6203. Picks audience via iran(3),
 * builds the body, enqueues to all matching player bits.
 */
export function romspkBroadcast(state: GameState): void {
  const audience = state.rng.iran(3); // 1=all, 2=Fed (humans), 3=Emp (klingons)
  const recipients =
    audience === 1 ? ALL_MASK :
    audience === 2 ? FED_MASK :
    EMP_MASK;

  const leadin = LEADIN_BROADCAST[state.rng.iran(4) - 1] ?? LEADIN_BROADCAST[0]!;
  const adj = ADJECTIVES[state.rng.iran(5) - 1] ?? ADJECTIVES[0]!;
  // Source 6247: `sosl p2,tmp` — for broadcast, the species comes from the audience-indexed
  // SPECIES_BROADCAST table (1=sub-Romulan, 2=human, 3=klingon).
  const species = SPECIES_BROADCAST[audience - 1] ?? SPECIES_BROADCAST[0]!;
  const obj = OBJECTS[state.rng.iran(5) - 1] ?? OBJECTS[0]!;

  const body = `${leadin}${adj}${species}${obj}s!`; // broadcast pluralizes (source 6265)
  state.bus.makeMsg(
    { dispfr: DX.ROM * 100, recipients, body },
    recipients,
  );
}

/**
 * Single-player taunt (source rmspk0 path at 6213). Addresses one specific captain
 * (their bit), uses the more personal leadin + the rmgprn species fallback. `who` is the
 * target's player slot (1..KNPLAY); the target's team determines the species fallback.
 */
export function romspkSingle(state: GameState, who: number, team: 1 | 2): void {
  const recipients = state.bits[who] ?? 0;
  if (recipients === 0) return;

  const leadin = LEADIN_SINGLE[state.rng.iran(4) - 1] ?? LEADIN_SINGLE[0]!;
  const adj = ADJECTIVES[state.rng.iran(5) - 1] ?? ADJECTIVES[0]!;
  const species = singleSpecies(state.rng, team);
  const obj = OBJECTS[state.rng.iran(5) - 1] ?? OBJECTS[0]!;

  const body = `${leadin}${adj}${species}${obj}!`; // single — no plural 's'
  state.bus.makeMsg(
    { dispfr: DX.ROM * 100, recipients, body },
    recipients,
  );
}
