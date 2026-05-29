# DECWAR — Player's Guide

<p>
<strong>The University of Texas at Austin</strong><br>
<strong>Department of Arts and Entertainment Technologies</strong><br>
Contact: <strong>Eric Freeman</strong> &lt;eric.freeman@austin.utexas.edu&gt;<br>
More information on DECWAR and related initiatives: <strong>Noah Smith</strong> &lt;noahhsmith@gmail.com&gt; &middot; <a href="https://decwar.org">decwar.org</a>
</p>

> **License and attribution.** Original DECWAR (FORTRAN/MACRO-10, 1979) © 1979,
> 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and
> Harris Newman, under GPL v3+.  This TypeScript port © 2026 The University of
> Texas at Austin, Department of Arts and Entertainment Technologies, also under
> GPL v3+.  See `LICENSE` / `NOTICE` for full terms.

---

A guide to *playing* DECWAR — for first-time captains who have never seen a 1978
PDP-10 game, and for veterans who want strategy, formulas, and tactical depth.

This complements `MANUAL.md` (the per-command reference). The manual tells you
**what** every command does; this guide tells you **how to play** and **how to win**.

---

## Contents

1. [What DECWAR is](#1-what-decwar-is)
2. [Your first ten minutes](#2-your-first-ten-minutes)
3. [The galaxy](#3-the-galaxy)
4. [Reading STATUS](#4-reading-status)
5. [Moving around](#5-moving-around)
6. [Sensors and intelligence](#6-sensors-and-intelligence)
7. [Combat — phasers](#7-combat--phasers)
8. [Combat — torpedoes](#8-combat--torpedoes)
9. [Defense, damage, and repair](#9-defense-damage-and-repair)
10. [Energy: the lifeblood](#10-energy-the-lifeblood)
11. [Territory: planets and bases](#11-territory-planets-and-bases)
12. [Comms and coordination](#12-comms-and-coordination)
13. [The Romulan](#13-the-romulan)
14. [How a game ends](#14-how-a-game-ends)
15. [Dying and reincarnating](#15-dying-and-reincarnating)
16. [Strategy: opening, midgame, endgame](#16-strategy-opening-midgame-endgame)
17. [Common mistakes](#17-common-mistakes)
18. [Expert techniques](#18-expert-techniques)
19. [Glossary](#19-glossary)
20. [Cheat sheet](#20-cheat-sheet)

---

## 1. What DECWAR is

DECWAR is a real-time multiplayer space-combat game written in 1978–79 at the
University of Texas for the DEC PDP-10. Up to **18 humans** share one galaxy:
nine captains commanding the **Federation** fleet, nine commanding the **Klingon
Empire** fleet. A neutral **Romulan** NPC may also be in the game, hunting both
sides for sport.

The object of the game is simple: **destroy or capture everything the enemy has
before they do it to you.** A side wins when the galaxy contains no neutral
planets *and* the other side has lost all its starbases.

You command one ship at a time. Every command you type advances real time. Other
captains' actions land on you as messages between prompts; this is real
multiplayer, not turn-based.

If a 1978 game sounds primitive: it kind of is, and that's the charm. There is
no graphics. There is no music. There is a 75×75 grid of sectors, a couple of
dozen commands, and a galaxy full of other humans who would prefer you were
dead. Once you internalize the systems it has remarkable tactical depth.

---

## 2. Your first ten minutes

A complete walkthrough of getting into a game from a cold start.

```sh
telnet decwarjs.com 2030
```

You'll see:

```
DECWAR

Enter HELp, PREgame, or blank
line:
```

**Press Enter.** You can skip the lobby entirely.

You may be asked four setup questions if you're the first one in. Sensible
defaults for a first game: press Enter, Enter, `yes` (Romulan), `no` (black
holes). Don't worry about tournament mode yet.

Next, side selection. If the fleets are even, you choose. If not, you're
assigned to the smaller side. Press Enter to accept.

Then ship selection. Pick any. Names don't matter mechanically — the
Excalibur shoots the same phasers as the Yorktown.

You're now in. Type `ST` (status) and you'll see something like:

```
SDate    1
Cond    Green
Loc     33-42
Torps   10
Ener    5000.0
Dam     0.0
Shlds   +100.0% 1000.0 units
Radio   On
Command:
```

You're alive at sector (33, 42) with 5000 energy, 10 torpedoes, shields up at
100%, and the radio listening. Those are the activation defaults — you don't
need to raise shields or turn on the radio. Look around immediately:

```
SCAN                  ; 21x21 grid centered on you
TARGETS               ; anything in weapons range right now?
LIST PLANETS          ; planet coordinates you know about
LIST BASES            ; same for starbases
```

`SCAN` shows every ship, base, and planet in range as a single character: `.`
is empty space, `+` is a friendly planet, `-` is enemy, `*` is neutral.
Uppercase letters are friendly ships/bases; lowercase are enemy.

You won't see enemy positions for things you haven't scanned yet. The map fills
in as you explore — that's intentional.

Find a friendly base near you and dock with it:

```
MOVE 25 30            ; warp to (25, 30) — adjust to wherever your nearest base is
DOCK                  ; refuel, repair, reload
```

While docked you regenerate energy, repair damage, and rearm torpedoes for
free. From a docked starting position you'll do well.

Now look for an enemy:

```
LIST ENEMY            ; positions of enemy ships you've spotted
TARGETS               ; everything in phaser/torpedo range
```

If something is in range, fight (see [combat](#7-combat--phasers) below). If
not, move toward enemy territory and scan as you go.

That's the loop. The rest of the guide unpacks each piece.

---

## 3. The galaxy

The playable space is a **75 × 75 grid of sectors**. Vertical coordinate first,
horizontal second — `MOVE 33 42` means "go to row 33, column 42." Coordinates
wrap with a hyphen in display (`Loc 33-42`).

Each sector holds at most one object. Sectors contain:

| Symbol | What it is |
|--------|-----------|
| `.` | empty space |
| `+` | friendly planet (Fed-controlled if you're Fed) |
| `-` | enemy planet |
| `*` | neutral / unowned planet |
| `#` | black hole (only if enabled at setup) |
| uppercase letter | a friendly ship or base |
| lowercase letter | an enemy ship or base |
| `<` `>` | edge of a phaser/torpedo trail (transient) |

Federation ships are named: **E**xcalibur, **F**arragut, **I**ntrepid,
**L**exington, **N**imitz, **S**avannah, **T**renton, **V**ulcan, **Y**orktown.
Their initials are the scan letters.

Empire ships: **B**uzzard, **C**obra, **D**emon, **G**oblin, **H**awk,
**J**ackal, **M**anta, **P**anther, **W**olf.

Starbases scan as `S` (friendly) or `s` (enemy). The Romulan is `R` / `r`.

At game start, **planets are scattered randomly** and there are about 30–50 of
them. Most are neutral. Each side has a small number of starbases pre-placed in
its half of the galaxy. You and your team start near one of them.

Range to anything is the **Chebyshev distance** — max of the row delta and
column delta. A ship 5 rows north and 8 columns east is 8 sectors away, not 13.
This matters for combat range (10 sectors max) and for `MOVE` warp factor
(which equals the max axis distance).

---

## 4. Reading STATUS

`STATUS` (or just `ST`) is the most-used command in the game. Every field:

```
SDate    1            ; stardate — game-time counter, starts at 1
Cond    Green         ; condition: Green / Yellow / Red
Loc     33-42         ; your sector
Torps   10            ; photon torpedoes loaded (cap 10)
Ener    5000.0        ; internal energy (cap 5000.0)
Dam     0.0           ; damage accumulated (game over at 2500.0)
Shlds   +83.1% 2077.5 units    ; shield charge (cap 100%)
Radio   On            ; radio listening on/off
```

**Condition** is your alert level:
- **Green** — nothing's nearby
- **Yellow** — an enemy is within scanner range but not shooting at you
- **Red** — you are *being shot at*, or you just shot at something. Lots of
  commands are blocked under Red alert (HELP, GRIPE, etc.) — you're supposed to
  fight or run, not browse menus.

**Energy** is everything: it powers movement, weapons, shields, and life
support. If it hits zero you're dead. You start with 5000.0 and the cap is
5000.0 — you cannot stockpile beyond full.

**Damage** is *cumulative hull damage*. At 2500.0 your ship explodes. Damage
also accumulates per-device (warp engines, impulse, phasers, etc.) and a device
becomes "critical" / disabled at 300.0 on that device.

**Shields** are a *separate* energy reservoir from your main energy. They
absorb hits before damage starts accumulating. Raising shields drains main
energy at a 25:1 ratio (you spend 25 internal energy to add 1 unit of shield
charge); lowering them returns most (not all) of that energy. The cap is 100%.

`STATUS L` gives the long form including per-device damage. `STATUS S` gives a
single-line tweet.

---

## 5. Moving around

Two movement commands. Both consume real time (other captains' messages and
attacks happen *while you move*).

### MOVE — warp drive

```
MOVE 25 30            ; absolute coordinates
MOVE R -3 5           ; relative: 3 sectors up, 5 right
MOVE A 25 30          ; explicit absolute (same as no prefix)
```

The **warp factor** equals the longer-axis distance, capped at 6. Energy cost:

```
energy = 40 * warp² * shield_mult * tow_mult
```

- `shield_mult` = 2 if shields are up, 1 if down
- `tow_mult` = 3 if you're towing a ship via tractor beam, else 1

So a warp-3 jump with shields up costs `40 × 9 × 2 = 720` energy. A warp-6
jump costs `40 × 36 × 2 = 2880` — almost 60% of your max energy in one
command.

**Warp 5 and 6 risk engine overheat**, which damages your warp drive. The risk
is probabilistic (a `tran > 80` roll at warp 6, `tran > 90` at warp 5). When
this fires you take warp-engine damage and the game tells you how many
stardates of repair time you'll need.

If your warp engines are already damaged, your max warp is capped at 3.

### IMPULSE — one sector, slow, cheap

```
IMPULSE 34 42         ; or IM R 1 0 to move one row down
```

IMPULSE moves exactly one sector at a time. It uses a *separate* engine. The
energy cost is the same formula at warp 1 (`40 × 1² = 40`, ×2 if shields up).

Why use IMPULSE? Three reasons:
- **Stealth movement** — one sector at a time, lets you sneak up on a
  position without committing to a long warp jump
- **Warp engines damaged** — you might still have impulse
- **Precision** — drop into the exact sector beside an enemy base for a phaser
  blast

Both MOVE and IMPULSE walk the path **one sector at a time**, checking for
collisions. If you'd hit a planet, base, ship, or black hole, the move either
aborts in front of it ("Collision averted, Captain!") or, for the unlucky, you
collide. Black holes are particularly unforgiving.

---

## 6. Sensors and intelligence

You can only fire at things you know about. Information is power.

### SCAN — short-range, 21×21 grid

`SCAN` (or `SR` for short-range scan) shows a 21×21 region centered on your
current position. Everything in that box appears as a single character.

```
SCAN          ; centered on you
```

This is your primary tactical view. Read it constantly.

### LIST — known objects by category

```
LIST PLANETS          ; every planet you've scanned at least once
LIST BASES            ; same for starbases
LIST ENEMY            ; every enemy ship you've spotted
LIST TARGETS          ; everything you can shoot RIGHT NOW
LIST SUMMARY          ; counts by side
```

Important: **LIST only shows things you've seen**. The galaxy fills in your
mental model as you explore. An enemy ship that hasn't been in your scanner
range is invisible to LIST. (Allies share intel through the team scan mask, so
a friendly ship spotting an enemy will populate your LIST too.)

### TARGETS — in-range things, sorted

`TARGETS` is a tactical readout. It only shows objects within phaser/torpedo
range (10 sectors), and tags each with bearing, distance, and shields.

Use TARGETS as the input to your "what do I shoot next" decision.

### Other intel

- `POINTS` — current scoreboard
- `USERS` — who else is logged in
- `TIME` — stardate / time remaining
- `RADIO` — on by default; `RADIO OFF` if you want quiet, `RADIO GAG <ship>` to mute one captain
- `DAMAGES` — per-device damage report

---

## 7. Combat — phasers

Phasers are your accuracy weapon. They draw from your main energy reservoir,
they always hit (no miss roll), and damage scales with how much energy you pump
into them.

### Syntax

```
PHASERS <v> <h>                ; auto-energy at sector (v,h)
PHASERS <units> <v> <h>        ; specific energy amount
PHASERS A <v> <h>              ; absolute coordinates
PHASERS R <dv> <dh>            ; relative
PHASERS C <ship-name>          ; "computer" — target by ship name
PHASERS C B                    ; abbreviated to one letter (Buzzard)
```

Example: `PH 300 12 32` fires 300 units of energy at sector (12, 32).

### How damage works

Range matters. Phaser hits attenuate over distance, roughly:

```
hit_at_target = fired_energy * (1 - distance/10) * shield_modifier
```

At range 1, almost all your energy lands. At range 10, almost none does. Range
0 (same sector — impossible normally) would deliver 100%.

The target's shields absorb most of the hit; what passes through becomes
hull/device damage. A ship at 80% shields takes far less damage than one at
20%.

Bases and planets fire back **automatically** when you come into range — see
the screenshot earlier this session where moving next to an Empire base ate
100+ units of damage from its defensive fire. Plan your approach.

### Phaser tactics

- **Don't dump max energy on one shot.** A 1000-unit phaser does much more
  total damage as four 300-unit shots than one 1200-unit shot, because
  intervening hits drain the target's shields and let later shots through.
- **Get close first.** Range 1–3 is dramatically more efficient than range
  8–10.
- **Drop shields before firing only if you're sure.** Phasers fire fine
  through your own shields; you only drop shields to recover energy (see
  [energy](#10-energy-the-lifeblood)).
- **Phasers eat YOUR energy too.** A 1000-unit shot is 1000 units gone from
  your reservoir regardless of how much actually lands on the target.

---

## 8. Combat — torpedoes

Torpedoes are your *can opener*. They travel in a straight line, ignore
distance (no range falloff), and do massive damage when they hit. But they can
miss, they're limited (max 10 loaded), and they cost energy.

### Syntax

```
TORPEDOS <v> <h>               ; one torpedo at (v,h)
TORPEDOS <count> <v> <h>       ; multiple — fires up to <count> torps
TORPEDOS C <name>              ; computer-aimed at a named ship
```

Each torp consumes one of your 10 loaded torpedoes and a small slice of energy.
There's a brief per-torp cooldown — you can't fire all 10 in one tick.

### How torpedoes hit

The torp travels in a straight line from you to the target sector, checking
each cell. The **first non-empty cell along the path** is what it hits — that
might be your target, or a planet that happens to be between you and the
target, or one of your own ships.

This is critical: **torps do not arc**. If there's anything in the way, that's
what you'll hit. Friendly fire is a real risk in a crowded sector.

A direct hit on a ship typically does several hundred units of damage *bypassing
most shield protection* — torpedoes are far more lethal per shot than phasers.
A torpedo can kill a bare-shields ship outright.

### Torpedo tactics

- **Use phasers to strip shields first, then torps to kill.** Phasers
  drain shields cheaply; torps punch through what's left.
- **Watch for cover.** An enemy hiding behind one of their own planets is hard
  to torp — the planet eats the shot.
- **Mind your own fleet.** Look at SCAN before firing — make sure your line
  to the target is clear.
- **Out of torps?** You're an unarmed phaser ship. Dock or build to restock.

---

## 9. Defense, damage, and repair

### Shields

`SHIELDS UP` / `SHIELDS DOWN` toggles your shields. While up, shields absorb
incoming hits at a high efficiency. While down, every hit goes straight to your
hull and devices.

Raising shields costs **25 energy per shield-charge unit** added. The shield
cap is 100% (1000 charge units), so a full shield raise from 0% costs 25,000
energy — which you don't have. Realistically you raise to whatever your energy
allows and top off as you go.

Lowering shields refunds *most* (but not all) of that energy back to your main
reservoir.

`SHIELDS C <pct>` — raise shields to a specific percentage. `SHIELDS C 50`
brings them to half charge.

### Damage and repair

Hull damage accumulates in `Dam` (game over at 2500). Each device also
accumulates its own damage; at 300 the device becomes "critical" (disabled).

Devices and what they do when disabled:
- **Warp engines** — capped at warp 3 (heavy damage = no warp at all)
- **Impulse** — no impulse moves
- **Phasers** — phasers offline
- **Torpedoes** — torps offline
- **Shields** — shields offline (very bad)
- **Computer** — your moves randomly deflect (course inaccuracy)
- **Life support** — backup reserves count down (5 stardates of grace)
- **Radio** — can't hear messages
- **Damage Control** — slower auto-repair

The `DAMAGES` command shows the per-device situation.

Repair happens **automatically over time** (every stardate that passes, all
damage ticks down a bit). Repair is much faster while **docked at a starbase**
— bases give a major repair-rate multiplier on top of the energy and torpedo
refill.

If a critical device is keeping you out of the fight, get to a base.

---

## 10. Energy: the lifeblood

Energy management is the single biggest skill in DECWAR.

You start at 5000.0 (the cap). You spend energy on:
- Movement (40 × warp², doubled with shields up)
- Phasers (1:1, what you fire is what you spend)
- Raising shields (25:1, you spend 25 to add 1 charge unit)
- Towing a ship (3× the movement cost)
- Life support (a slow continuous drain)

You **gain** energy from:
- Docking at a friendly starbase (full refuel + repair + rearm)
- Capturing a planet (planet's stored energy transfers)
- Building a base (paradoxically — see [territory](#11-territory-planets-and-bases))

**You cannot exceed 5000.0.** Topping off at a base is a brief operation; the
overflow is wasted. Spend energy down before docking if you've been hoarding.

### Energy rules of thumb

- **Never let energy fall below ~500 in enemy territory.** You need a reserve
  for emergency shield-raising and an escape jump.
- **Shields-up movement costs double.** Sometimes it's worth dropping shields
  for a long transit move if no enemies are near. Pop them back up before any
  contact.
- **Phaser efficiency is a function of range, not energy.** A 200-unit shot
  at range 2 does more damage than a 600-unit shot at range 8.
- **Don't dock at 4900/5000.** You're wasting the dock cycle. Burn down to
  ~2000 first if you're going to refill anyway.

---

## 11. Territory: planets and bases

This is how you actually win the game. Combat is the means; territory is the
end.

### Planets

Planets are either **neutral** (`*`), **Federation** (`+` if you're Fed,
`-` if you're Emp), or **Empire**. Captured planets:
- Show up in `LIST PLANETS` as your color
- Fire defensively on enemy ships in range
- Contribute to your team's score
- Can be the target of an enemy `CAPTURE`

To capture: get adjacent (within 1 sector) and type `CAPTURE`. Captures take
several attempts; each attempt has a probability of success and the planet may
fire back. Planets with `BUILD`s on them (defensive installations) are harder
to capture and shoot at you more.

You can also **BUILD** on a planet you control — incrementally adding
defensive infrastructure. A maxed-out planet is a serious obstacle to enemy
movement and a respectable damage dealer.

### Starbases

Starbases are your big strategic assets:
- Each side starts with **a few** (varies, typically 3–5)
- You can `BUILD BASE` on a captured friendly planet to add more (max 10 per
  side)
- A base **repairs, refuels, rearms** any friendly ship that docks
- Bases auto-fire on enemy ships in range — they're brutal defensive turrets
- Losing all your bases (with no neutral planets left to capture) ends the
  game

Bases are the centerpiece of the win condition. The game ends when:

> `nplnet == 0 AND (nbase[fed] == 0 OR nbase[emp] == 0)`

— no neutral planets remain *and* one side has zero bases. So the path to
victory is: capture every neutral planet, then take down the last enemy base.
The path to loss is the opposite.

### Building

```
BUILD                 ; build at your current location (must be a friendly planet)
BUILD BASE            ; upgrade to a full starbase
```

Building progresses in stages. The full base cost is high (2500 energy) but
each stage is incremental, and you can leave a half-built base for later. A
ship doing BUILD work needs to be at the planet — they're vulnerable while
building.

---

## 12. Comms and coordination

### TELL — send a message

```
TELL ALL Hello team   ; broadcast to your team
TELL FED defending B  ; same — explicit team
TELL EMP surrender?   ; cross-team trash talk
TELL E covering you   ; to a specific ship (Excalibur)
```

Your radio is on by default — messages arrive between your prompts. Turn it
off (`RADIO OFF`) only if the chatter is genuinely distracting; you'll miss
team alerts and base-under-attack warnings.

### Coordination matters

DECWAR with no coordination is a brawl. DECWAR with team coordination is a
chess match. Three captains attacking one enemy ship in sequence is a kill;
three captains attacking three enemies independently is three damaged enemies
and no kills.

Standard call-outs:
- "EMP B at 33-42" — sighting
- "Engaging C" — committing to a fight
- "Need cover at base S3" — request for support
- "RTB" — return to base

---

## 13. The Romulan

The Romulan is an NPC that may or may not be in the game (a setup option). It
behaves like a hostile ship that:
- Wanders the galaxy
- Cloaks (it's invisible to scan most of the time, decloaking unpredictably)
- Fires phasers and torpedoes at whoever it sees
- Spawns occasional taunting broadcast messages ("Death to all who oppose me")
- Can destroy ships, planets, AND bases

The Romulan does not pick sides — it hits Fed and Emp equally. If a Romulan is
nearby, it's a problem for everyone.

Romulan strategy:
- Cloak makes it hard to engage. SCAN won't reliably show it.
- When it decloaks, drop everything and hit it hard. A torpedo barrage from
  multiple captains can kill it in one round.
- It will sometimes destroy enemy bases for you. Free win.

If `TELL ROMULAN <anything>` is allowed in this build, you can taunt back. It
won't change anything mechanically — but the Romulan will reply.

---

## 14. How a game ends

Three end states:

1. **Federation wins** — all neutral planets captured, Empire has zero
   starbases left.
2. **Empire wins** — symmetric.
3. **Total destruction** (rare) — all planets *and* both sides' bases destroyed
   simultaneously. Game restarts; everyone gets to reincarnate fresh.

End-of-game banner broadcasts to everyone, scores are recorded, and the
universe resets after a brief grace period (the **5-minute hitime grace** —
the galaxy holds its state for 5 minutes after the last player leaves, then
rebuilds fresh on next activation).

The honor roll persists across games. Your final score and captain name end up
on it if you score high enough.

---

## 15. Dying and reincarnating

Death happens when:
- Your damage reaches 2500
- Your energy reaches 0
- You collide with a black hole or something catastrophic
- Life support runs out (you're disabled in deep space and didn't repair in
  time)

When you die, you're dropped back to the lobby. Your honor-roll entry is
written. You can reincarnate immediately:

```
ACTIVATE              ; or just press Enter at the strtup prompt
```

— back into a fresh ship on the same team (if your side still has a slot).
The galaxy's state persists; you respawn into a game already in progress.

Your previous ship is gone for good. Anything it carried (torpedoes, etc.) is
lost.

---

## 16. Strategy: opening, midgame, endgame

### Opening (stardates 1–~5)

- Get oriented. `STATUS`, `SCAN`, `LIST PLANETS`.
- Identify your nearest neutral planet and your nearest enemy.
- **Capture a neutral planet early.** Neutrals don't fire back — they're
  free territory. The early game is a planet rush.
- Don't engage enemies unless you outnumber them locally. Solo combat at
  full health is rarely decisive; it just damages both sides.
- Coordinate with your team. Pick a side of the galaxy and claim it.

### Midgame (stardates ~5–20)

- Convert captured planets into BUILDs. A built planet is hard to recapture
  and shoots back.
- Look for enemy ships at low energy or low torps and gang up on them.
- Start moving toward the enemy's bases. Bases are the win condition.
- Watch the Romulan if it's in play. Stay out of its way unless you have a
  3-on-1 advantage.

### Endgame (stardates ~20+)

- Hunt for the last neutral planets — get them under your side's control.
- Coordinate a base assault. Two or three ships attacking a base together can
  break through its defensive fire and torpedo it down.
- Don't suicide. A dead captain is a respawn delay; a damaged captain who
  docked and healed is more useful in 30 seconds than a dead one in 60.

---

## 17. Common mistakes

**Turning the radio off and forgetting.** Radio's on by default; if you ever
toggle it off, you'll go blind to team intel and base-under-attack alerts
until you toggle it back on.

**Dropping shields to save energy and then taking a hit.** Shields-down means
hits go straight to hull and devices. The energy savings is real but the risk
is real too — only drop shields in clean space, well away from the front.

**Dumping all torpedoes at long range.** You'll burn through your magazine
and inflict minimal damage. Get close.

**Engaging an enemy at low energy.** You can't sustain it. Withdraw, dock,
return.

**Building a base in deep enemy territory.** It'll get destroyed before it
finishes. Build behind your front lines.

**Not capturing neutral planets.** They're free points and they shoot back
at enemies. Players who pass them up to chase combat lose territory races.

**`MOVE`ing to the same sector as an enemy ship.** That's not how you attack
— you'll get "Own location used!" (if it's you) or collision messages. You
need to be *adjacent* (1 sector) and use `PHASERS` or `TORPEDOS`.

**Ignoring damage.** A ship at 1500 damage with a critical warp engine and
two dead weapons is a coffin. Dock before you can't.

**Going into combat without shields.** Shields-down damage is multiplicatively
worse than shields-up damage. Pop them up the second you see an enemy.

---

## 18. Expert techniques

### Stacked commands

Multiple commands on one line separated by `/`:

```
SH U / MO 25 30 / DOCK / ST
```

Raise shields, move to (25, 30), dock, then status. Each runs in sequence; if
one fails the rest still try.

### Relative-coordinate macros

`MOVE R 1 0` always means "one row down from wherever I am." Useful for
patrol patterns and one-key tactical moves.

### Phaser stripping

A target's shields go down with each hit. Sequence your fire: 3 small phaser
shots to strip shields, then a torpedo to kill. Total energy spent: much less
than trying to brute-force through full shields with a single big shot.

### Tractor + tow tactics

`TRACTOR <ship>` locks onto another ship. You can then drag a damaged
friendly back to a base, or drag a tow target into a fight (towing
*triples* your movement energy cost — use sparingly).

### Base camping

If the enemy has only one base left, park a ship 2 sectors away on phaser
patrol. They can't easily resupply. This is brutal but effective in the
endgame.

### The "ghost" scan

A friendly ship that scans an enemy populates your team's intel. Coordinate
scouts: one ship doing nothing but scanning while three do the killing.

### Tournament-mode practice

Setup option 1, "Tournament," takes a name or number that seeds the RNG. Two
sessions with the same tournament seed get the **same galaxy layout** — same
planet positions, same starting energy, etc. Use this for serious practice.

---

## 19. Glossary

- **Captain** — you. Your in-game identity and your honor-roll handle.
- **Sector** — one cell on the 75×75 grid.
- **Stardate** — the in-game time counter. Increments with time-consuming
  commands.
- **Warp** — speed factor for `MOVE`. Equals the longer-axis distance, max 6.
- **Impulse** — slow-but-cheap one-sector movement.
- **Phaser** — energy-based weapon, hits guaranteed, damage falls off with
  range.
- **Photon torpedo** — kinetic projectile weapon, can miss or hit obstacles in
  its path, very high damage.
- **Shield** — defensive energy buffer. Absorbs hits.
- **Critical** — a device that's taken more than 300 damage and is disabled.
- **Dock** — sit adjacent to a friendly starbase to refuel/repair/rearm.
- **Capture** — take ownership of a planet by being adjacent and issuing
  `CAPTURE`.
- **Build** — install defensive infrastructure on a planet, or upgrade to a
  full starbase.
- **Tractor** — beam-lock onto another ship. Can be used to tow friendlies or
  drag tow targets into combat.
- **Hitime** — the 5-minute grace period during which the galaxy persists
  after the last player leaves.
- **Honor roll** — persistent leaderboard of high scores.
- **RTB** — return to base (player slang, not a command).
- **Strip / kill** — combat tactic: phasers to drop shields, torpedoes to
  kill.

---

## 20. Cheat sheet

The shortest useful command set:

| Goal | Command |
|------|---------|
| Status | `ST` |
| Look around | `SCAN` |
| Find targets | `TARGETS` |
| Move | `MO <v> <h>` |
| Move slowly | `IM <v> <h>` |
| Shields up | `SH U` |
| Fire phasers | `PH <e> <v> <h>` |
| Fire torpedoes | `TO <v> <h>` |
| Dock | `DO` |
| Capture | `CA` |
| Build | `BU` |
| Send message | `TE A <text>` |
| Receive messages | `RA ON` |
| List enemies | `LI E` |
| Damages | `DA` |
| Quit | `QU` |
| Help | `HE <topic>` |

Most commands accept 2-character abbreviations (the same prefix rule the
parser uses everywhere). You can stack with `/`: `SH U / DO / ST`.

---

*Good hunting, Captain.*
