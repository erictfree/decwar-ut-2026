# DECWAR — Captain's Manual

<p>
<strong>The University of Texas at Austin</strong><br>
<strong>Department of Arts and Entertainment Technologies</strong><br>
Contact: <strong>Eric Freeman</strong> &lt;eric.freeman@austin.utexas.edu&gt;<br>
More information on DECWAR and related initiatives: <strong>Noah Smith</strong> &lt;noahhsmith@gmail.com&gt; &middot; <a href="https://decwar.org">decwar.org</a>
</p>

> **License and attribution.** Original DECWAR (FORTRAN/MACRO-10, 1979) © 1979,
> 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and
> Harris Newman, under GPL v3+.  This TypeScript port © 2026 Eric Freeman and
> The University of Texas at Austin, Department of Arts and Entertainment
> Technologies, also under
> GPL v3+.  See `LICENSE` / `NOTICE` for full terms.

A guide to playing the TypeScript / telnet port of the 1978 PDP-10 game.

---

## Table of Contents

1. [What this is](#what-this-is)
2. [Connecting](#connecting)
3. [The lobby](#the-lobby)
4. [Setting up a game](#setting-up-a-game)
5. [Choosing a side and a ship](#choosing-a-side-and-a-ship)
6. [The galaxy](#the-galaxy)
7. [The command prompt and STATUS](#the-command-prompt-and-status)
8. [Movement](#movement)
9. [Sensors](#sensors)
10. [Combat](#combat)
11. [Defense and repair](#defense-and-repair)
12. [Energy and tractor beams](#energy-and-tractor-beams)
13. [Territory: building and capturing](#territory-building-and-capturing)
14. [Communications](#communications)
15. [Information commands](#information-commands)
16. [Preferences (SET)](#preferences-set)
17. [The Romulan](#the-romulan)
18. [How a game ends](#how-a-game-ends)
19. [Dying and reincarnating](#dying-and-reincarnating)
20. [Privileged commands](#privileged-commands)
21. [Persistence: honor roll, captain name](#persistence-honor-roll-captain-name)
22. [Quick reference](#quick-reference)

---

## What this is

DECWAR is a multiplayer space-combat game from 1978–79, originally written in FORTRAN IV
and MACRO-10 assembly for the DEC PDP-10 under TOPS-10. Up to 18 players share one galaxy:
9 Federation captains versus 9 Klingon Empire captains, optionally with a Romulan NPC
prowling around looking for trouble.

This port is a **faithful compatibility port**: the game mechanics, formulas, RNG draw
order, and message text are preserved exactly. Only the machinery underneath (PDP-10 → Node,
FORTRAN → TypeScript, blocking I/O → async telnet) has been adapted. See `PORT.md` for the
full original-vs-port story.

## Connecting

Start the server:

```sh
cd decwar-ts
npm install    # one-time
node src/main.ts
```

By default it listens on TCP port `2030`. Set `DECWAR_PORT` to override.

From another terminal:

```sh
telnet localhost 2030
```

Optional environment variables:

| Var | Purpose | Default |
|-----|---------|---------|
| `DECWAR_PORT` | TCP port the server binds | `2030` |
| `DECWAR_HONOR_PATH` | JSON file the honor roll persists to | `./decwar-honor.json` |
| `DECWAR_TEXT_DIR` | Directory the in-game HELP/NEWS read from (and where GRIPE appends) | `./data` |

## The lobby

When you connect, the **STRTUP prompt** appears:

```
Enter HELp, PREgame, or blank
line:
```

Three options:

- **A blank line** — start the activation sequence (jump straight into game setup).
- `HONORROLL` — display the honor roll for past games, then re-prompt.
- `HELP` — print a brief help summary, then re-prompt.
- `PREGAME` — enter the `PG>` mini-shell where you can browse / use pre-game commands.

The `PG>` shell understands a subset of commands that don't need an active ship:

```
ACTIVATE GRIPE HELP HONORROLL NEWS POINTS QUIT SET SUMMARY TIME TYPE USERS
*DEBUG *PASSWORD *ZAP
```

Type `ACTIVATE` (or just press Enter at the STRTUP prompt) to start playing.

## Setting up a game

The first player to activate **builds the universe** and is asked four setup questions:

1. **`Regular or Tournament game? (Regular)`** — A tournament game lets you re-seed the
   RNG with a tournament name or number so the galaxy layout is reproducible. Press Enter
   for the regular default.

2. **`Tournament name or number:`** (only if you said TOURNAMENT) — Anything you type;
   numeric tokens seed the RNG with their absolute value.

3. **`Is the Romulan Empire involved in this conflict? (yes)`** — `YES` (default) puts
   the Romulan NPC in the galaxy. `NO` disables it.

4. **`Do you want black holes? (no)`** — `YES` adds 10–50 black holes that swallow ships,
   torpedoes, and bases. `NO` (default) leaves them out.

Later players who join an in-progress game see only:

```
There are Romulans in this game.
There are Black holes in this game.
```

(Only if those options were enabled.)

## Choosing a side and a ship

You'll see a fleet-count banner:

```
Currently there are 2
Federation ships and 1
Empire ships.
```

If the sides are within one ship of each other, you'll be asked:

```
Which side do you wish to join?
(Federation or Empire)
```

Accept the default (the smaller side, Federation on a tie) by pressing Enter, or type
`FEDERATION` / `EMPIRE` explicitly.

If the sides differ by 2 or more, you'll be auto-assigned to the smaller fleet.

Then the ship-selection menu:

```
You will join the Federation.

These vessels are available:

Excalibur
Farragut
Intrepid
...

Which vessel do you desire?
```

Type a ship name (prefix match is OK — `Exc` for Excalibur). Names of ships currently in
use are not listed; if you ask for one already taken, you'll see "that vessel is being
used" and the list re-prints.

Federation ships: Excalibur, Farragut, Intrepid, Lexington, Nimitz, Savannah, Trenton,
Vulcan, Yorktown.

Empire ships: Buzzard, Cobra, Demon, Goblin, Hawk, Jackal, Manta, Panther, Wolf.

## The galaxy

The galaxy is a 75×75 grid of sectors. Each sector can hold one object:

- **Ships** — Federation (F1–F9) or Empire (E1–E9), max 9 per side
- **Bases** — Federation or Empire starbases (10 each at the start). Heal docked ships and
  defend their territory by firing on enemies in range 4.
- **Planets** — 60 neutral planets that can be captured. Captured planets contribute to
  scoring and defense (range 2). The "build count" of a planet reflects how fortified it
  is from being held.
- **Stars** — 100–355 stars scattered across the map. Most are harmless decoration, but
  any torpedo can knock one into a supernova that obliterates everything in its 3×3
  blast radius.
- **Black holes** — 10–50 black holes (optional). Anything that enters one is destroyed.
- **The Romulan** — A single mobile NPC enemy of both sides (optional). Hits hard, taunts
  you on subspace radio.

Scan symbols:

| Symbol | Meaning |
|--------|---------|
| `.` | empty space |
| ` E` / ` F` / … | Federation ship (using the captain's name's first letter) |
| ` B` / ` C` / … | Empire ship |
| `<>` | Federation base |
| `)(` | Empire base |
| `??` | Romulan |
| ` @` | Neutral planet |
| `@F` | Federation planet |
| `@E` | Empire planet |
| ` *` | Star |
| `  ` | Black hole |

## The command prompt and STATUS

After activation you'll see the command prompt:

```
Command:
```

Type any command and press Enter. Many commands can be abbreviated to a unique prefix
(`STAT` for STATUS, `MO` for MOVE, etc.). Multiple commands can be stacked on one line
separated by `/`:

```
Command: STATUS/SCAN 4
```

`STATUS` prints your ship's vitals: stardate, condition, location, torpedoes, energy,
damage, shields, radio. You can ask for specific items:

```
STATUS ENERGY SHIELDS
```

Verbosity is controlled by `SET OUTPUT SHORT|MEDIUM|LONG` — SHORT crams everything onto
one line; LONG breaks each item onto its own line and uses full labels.

Condition codes:

- **GREEN** — All quiet.
- **YELLOW** — Damaged or low on energy.
- **RED** — Recent combat. Some commands (HELP, GRIPE, QUIT confirmation) are gated under
  RED alert.

## Movement

`MOVE <v> <h>` (or just `MOVE`, which prompts for `Coordinates:`) moves your ship to
sector (v, h) at warp speed. Cost: `40 × ia²` energy per sector, where `ia` is the
absolute coordinate distance.

`IMPULSE <v> <h>` is the slower, cheaper, short-range alternative; it shares the same
mechanics as MOVE but with the engineering officer's polite warning about overheating
your warp engines if you push them too hard.

Coordinates can be absolute (`MOVE 30 40`) or relative if your `SET ICDEF` is set to
RELATIVE. You can also type `MOVE` with no args, then enter coordinates at the
`Coordinates:` prompt.

When a friendly ship has you under tractor beam, MOVE drags it along with you (extra
energy cost: ×3).

## Sensors

- **`SCAN <dir> <range>`** — Display a `range × range` grid centered around your ship in
  the given direction (N, S, E, W, NE, NW, SE, SW, or just a range for an all-directions
  view). Default range is 8; the grid is clamped to your terminal width.
- **`SRSCAN`** — Short-range scan. A more compact view of nearby space.
- **`DAMAGES`** — Lists each of your 9 devices and any damage they've taken.
- **`LIST`** — Lists known objects in the galaxy. Variants:
  - `LIST` (no args) — everything known
  - `LIST BASES` / `LIST PLANETS` / `LIST TARGETS` — filter by class
  - `LIST FRIENDLY` / `LIST ENEMY` — filter by alignment
  - `LIST … <range>` — limit to within N sectors
  - `LIST … SUMMARY` — counts only, no per-object lines
- **`BASES`** — Shortcut for `LIST BASES`.
- **`PLANETS`** — Shortcut for `LIST PLANETS`.
- **`TARGETS`** — Shortcut for `LIST TARGETS` (enemy ships, bases, the Romulan).
- **`SUMMARY`** — Shortcut for `LIST SUMMARY`.

## Combat

Two weapon systems:

### Phasers — `PHASERS [<phit>] <v> <h>`

Phaser bank fires at sector (v, h). `phit` is the energy invested (50–500, default 200);
higher means more damage but more strain.

- Phasers have two banks — the cooler one fires first. Each fire imposes a brief
  cooldown based on terminal speed (`(slwest+1) × 1500 ms` per bank).
- If your shields are up, phasing costs an extra 2000 energy ("high-speed shield
  control") because the shields have to dip momentarily.
- Each shot risks an overheat: if `iran(100) × phit > 18900`, your phaser device takes
  damage. Heavy damage can disable the bank.
- Range cap: KRANGE (10 sectors).
- Damage is reduced by the target's distance and shield strength.

You can fire on ships, bases, planets, the Romulan. Friendly targets are refused.

### Torpedoes — `TORPEDOS [<count>] <v> <h>`

Photon torpedoes — 1, 2, or 3 in a burst. Each consumes one of your 10 starting
torpedoes. Each torpedo:

- Has a chance to **misfire** (`iran(100) > 96`), which aborts the remaining torpedoes in
  the burst and damages your torpedo tubes.
- Can be **deflected** by shielded targets (a `ran()` deflection check, plus a
  conditional second check if there's a misfire).
- Travels along the path to the target. The CHECK routine resolves what it hits — an
  intervening ship, base, planet, star, black hole, or your original target.
- Damage on hit: `4000 + 4000 × ran()` (in tenths of a damage unit).

Star hits: `aran ≤ 80` → the star novas (3×3 blast that damages everything around it,
including stars which can chain). `aran > 80` → the star is unaffected.

Planet hits: `aran ≥ 75` → buildCount decrements; at 0 the planet is destroyed (loss for
the holding side).

## Defense and repair

- **`SHIELDS UP`** / **`SHIELDS DOWN`** — Raise or lower shields. Up means incoming fire
  is absorbed (at a 25:1 internal-energy cost per shield-charge unit).
- **`SHIELDS TRANSFER <pct>`** — Move shield charge between strength and your energy
  reserves. Doesn't fire if your shields device is critically damaged.
- **`REPAIR ALL`** / **`REPAIR <n>`** / **`REPAIR DAMAGE`** — While docked, fix damaged
  devices. Costs time proportional to the repair size. `DAMAGE` repairs everything past
  the listed-damage threshold.
- **`DOCK`** — Dock at an adjacent friendly base (full refit) or captured planet (half
  refit). Refit restores shields, energy, torpedoes, life-support. Bases give a double
  refit and planets a single refit. While docked your ship is also automatically defended
  by the base/planet.

A `dock STATUS` (i.e. `DOCK STATUS`) appends a STATUS report after docking.

## Energy and tractor beams

- **`ENERGY <ship> <amount>`** — Transfer energy to a friendly ship in range. 10% is lost
  in transit, but you still pay the full amount.
- **`TRACTOR <ship>`** — Engage a tractor beam on a friendly ship (mutual coupling). Both
  shields must be down. While tractoring, your MOVE drags the towed ship along at triple
  energy cost.
- **`TRACTOR OFF`** / `TRACTOR` (with active beam) — Release the beam.

## Territory: building and capturing

- **`BUILD`** — Convert an adjacent captured friendly planet into a starbase. Five stages
  of build counts; each stage rewards points. At stage 5 the planet upgrades into a new
  base (provided your side has a free base slot).
- **`CAPTURE`** — Capture an adjacent enemy or neutral planet for your side. Damages the
  planet's defenses with PHADAM, scoring per-unit damage. Triggers messages to enemy
  observers ("…is capturing your planet…"). On enemy planets it kills any docked ships
  (BASKIL).

Captured planets contribute to your team's defensive perimeter (they fire on enemies in
range 2 every world tick).

## Communications

- **`RADIO ON`** / **`RADIO OFF`** — Mute incoming radio chatter (your sender bit goes
  into the shared `nomsg` mask).
- **`RADIO GAG <ship>`** / **`RADIO UNGAG <ship>`** — Drop or restore one sender.
- **`TELL <recipient(s)>; <message>`** — Send a radio message. Recipients can be ship
  names or group names (`ALL`, `FEDERATION`, `EMPIRE`, `FRIENDLY`, `ENEMY`, `HUMAN`,
  `KLINGON`).
- **`TELL ROMULAN; <body>`** — Address the Romulan. If alive, it sends a personalized
  taunt back to you (sometimes graphic — don't say we didn't warn you). If dead, you'll
  see "Communications: Captain, we cannot raise the Romulan."

Outgoing recipients are listed with the 2-character ship scan tags in the
"Message from X to Y" header.

## Information commands

- **`STATUS`** — Your ship's vitals (see above).
- **`DAMAGES`** — Per-device damage report.
- **`POINTS`** — Score breakdown by category. Args: `ME`/`I`, `FEDERATION`/`HUMANS`,
  `EMPIRE`/`KLINGONS`, `ROMULANS`, or `ALL`.
- **`TIME`** — Game time, ship time, your runtime, and time-of-day.
- **`USERS`** — All active captains, their ships, and sides. Privileged players also see
  locations.
- **`TYPE OUTPUT`** / **`TYPE OPTION`** — Show your current SET preferences or the game
  options (Romulan? Black holes? Tournament?).

## Preferences (SET)

`SET <switch> [<value>]` — adjust per-session preferences. Switches:

| Switch | Values | Effect |
|--------|--------|--------|
| `OUTPUT` | `SHORT` / `MEDIUM` / `LONG` | Verbosity for STATUS, hits, etc. |
| `PROMPT` | `NORMAL` / `INFORMATIVE` | Adds extra status into the command prompt |
| `SCANS` | `SHORT` / `LONG` | Short/long-form scan grid cells |
| `ICDEF` | `ABSOLUTE` / `RELATIVE` | Default for input coordinates |
| `OCDEF` | `ABSOLUTE` / `RELATIVE` / `BOTH` | Default for output coordinates |
| `NAME` | (12 chars max) | Your captain name (persisted to honor roll) |

Privileged (after `*PASSWORD`):

- `SET ROMOPT` — turn the Romulan on mid-game
- `SET ENDFLG` — force endgame
- `SET BHREMV` — remove all black holes

## The Romulan

An NPC enemy of both sides. Spawn chance increases as the game progresses (`moveCounter`
must exceed `numply × 3`, then `iran(5)`-gated). On spawn it draws `iran(200) + 200`
energy and broadcasts a taunt (1-in-10 chance) to a random side (`iran(3)`).

Each Romulan turn it picks the nearest visible ship or base, moves warp 4 toward it (via
the CHECK routine, stopping one short), then attacks with either phasers (flat 200 damage)
or torpedoes (3-burst with full misfire / deflection / nova / planet branches).

Phaser hits on the Romulan reduce its `erom` pool; torpedo hits do
`min(iran(4000), 2000)`. When `erom ≤ 0`, the Romulan dies (DEADRO).

`TELL ROMULAN; <body>` triggers a single-player taunt response — using one of:

> You have aroused my wrath, mindless human worm!
>
> You will witness my vengence, idiotic vertebrate parasite!
>
> May you be attacked by a slime-devil, stupid klingon toad!
>
> I will reduce you to quarks, worthless sub-Romulan cretin!

(The misspelling of "vengence" is preserved verbatim from the 1978 source.)

## How a game ends

The game ends when **no planets remain AND at least one side has no bases left** (source
DECWAR.FOR:955 ENDGAM). Three outcomes:

- One side's bases gone, the other's still standing → that side wins.
- Both sides' bases AND all planets gone (total destruction, `endflg = -2`) → both lose.

When the end-of-war condition is detected, every active session sees a banner at their
next message-drain heartbeat (≤2 seconds — you don't need to type anything):

```
THE WAR IS OVER!!

The Klingon Empire is VICTORIOUS!!
Please proceed to the nearest Klingon slave planet.
```

Then your session is dropped. The next player to connect builds a fresh universe.

## Dying and reincarnating

If your ship is destroyed (`damage ≥ KENDAM` or `energy ≤ 0`), you'll see:

```
Excalibur RUNS OUT OF ENERGY!!
```

(or `…has been destroyed.`), then you're dropped back into the lobby. You can reactivate
immediately. The **kill queue** (KQADD on death, KQSRCH on activate) remembers you:

- If your old ship is still free, you reincarnate into it — no side or ship prompts.
- If your old ship has been taken, you get the "reassigned" prompt and can pick another
  from the same side (or QUIT out).
- If your old side is full, you get the **defect** prompt — say YES to switch teams and
  pick from the other side's ship list.

The honor roll records your captain name + final score whether you died or quit.

## Privileged commands

These need `pasflg = true`, which you get by typing `*PASSWORD <password>` (the password
is the one from the source's `PARAM.FOR`). After that:

- `*DEBUG` — placeholder
- `*ZAP` (pre-game only) — clears the persistent honor roll. Prints "Zapping statistics
  logs.... Finished!".
- `SET ROMOPT`, `SET ENDFLG`, `SET BHREMV` — privileged SET subcommands (see above).

Privileged USERS shows ship locations alongside the captain list.

## Persistence: honor roll, captain name

Two things outlast a single game:

- **Honor roll** — Per-side top-5 captains by score, with a flag distinguishing "Emerald
  Star Cluster" (living, just quit) from "Golden Galaxy Medal" (fallen in combat).
  Stored as JSON in `decwar-honor.json` (override path with `DECWAR_HONOR_PATH`).
  Displayed by the pre-game `HONORROLL` command.
- **Captain name** — `SET NAME <name>` (up to 12 chars, uppercased). Persisted with your
  honor entry. When you reconnect, your name is auto-restored if your connection's
  identity (remote address + port) matches a prior entry.

`*ZAP` clears the honor roll entirely (pre-game, privileged).

## Quick reference

| Category | Commands |
|----------|----------|
| **Movement** | MOVE, IMPULSE |
| **Combat** | PHASERS, TORPEDOS |
| **Defense** | SHIELDS, REPAIR, DOCK |
| **Engineering** | ENERGY, TRACTOR |
| **Territory** | BUILD, CAPTURE |
| **Sensors** | SCAN, SRSCAN, DAMAGES, LIST, BASES, PLANETS, TARGETS, SUMMARY |
| **Info** | STATUS, POINTS, TIME, USERS, TYPE |
| **Comms** | RADIO, TELL |
| **Session** | SET, HELP, NEWS, GRIPE, QUIT |
| **Privileged** | *PASSWORD, *DEBUG |
| **Pre-game only** | ACTIVATE, HONORROLL, *ZAP |

### Common abbreviations

| Type | Abbreviation expands to |
|------|------------------------|
| `STA` | STATUS |
| `MO` | MOVE |
| `IM` | IMPULSE |
| `PH` | PHASERS |
| `TO` | TORPEDOS |
| `SH` | SHIELDS |
| `RE` | REPAIR |
| `LI` | LIST |
| `DA` | DAMAGES |
| `S` | (ambiguous — SET vs SHIELDS vs SCAN…) |

If a prefix matches multiple commands you'll see `Ambiguous command -- for help type HELP`.

### Stacking and macros

Stack multiple commands on one line with `/`:

```
SHIELDS DOWN/MOVE 30 30/SHIELDS UP/STATUS
```

Each command runs in turn.

### Help and feedback

- `HELP` — general summary
- `HELP *` — command list
- `HELP <topic>` — topic-specific help (driven by `data/decwar.hlp`)
- `NEWS` — server-side news (`data/decwar.nws`)
- `GRIPE` — multi-line feedback (terminated by a single `.` or blank line); persisted as
  JSON-Lines in `data/decwar.grp`

---

For the technical story of what was preserved, what was simplified, and what was fixed
between the original 1978 source and this port, see `PORT.md`.

Good hunting, Captain.
