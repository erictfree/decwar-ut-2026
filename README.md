# decwar-ts

<p>
<strong>The University of Texas at Austin</strong><br>
<strong>Department of Arts and Entertainment Technologies</strong><br>
Contact: <strong>Eric Freeman</strong> &lt;eric.freeman@austin.utexas.edu&gt;<br>
More information on DECWAR and related initiatives: <strong>Noah Smith</strong> &lt;noahhsmith@gmail.com&gt; &middot; <a href="https://decwar.org">decwar.org</a>
</p>

> **License and attribution.** The original DECWAR (FORTRAN IV / MACRO-10, 1978–79)
> is © 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation
> Center, and Harris Newman, released under the GNU General Public License v3 or
> later.  This TypeScript port is a derivative work, © 2026 Eric Freeman and
> The University of Texas at Austin, Department of Arts and Entertainment
> Technologies, also
> released under GPL v3 or later as required by the GPL.  See `LICENSE` and
> `NOTICE` for the full terms.

A faithful TypeScript / Node.js / telnet **compatibility port** of DECWAR — the
18-player Federation-vs-Empire space-combat game written in 1978–79 for the DEC PDP-10 in
FORTRAN IV and MACRO-10. This port targets the **original 18-player University of Texas
version** (the `utexas23-reconstruction` tree); CompuServe-specific changes are excluded.

> **Governing rule:** *Change the machinery only where necessary. Do not change the game.*
> The original FORTRAN/MACRO-10 source is the sole source of truth.

## Status — feature complete

All 33 in-game commands work. The lobby is fully interactive (Regular/Tournament,
Romulan/black-hole opt-ins, side prompt, ship-by-name selection, kill-queue reincarnation
with defect/reassigned prompts). The honor roll persists across server restarts. ENDGAM
detects game-end and broadcasts the banner; the galaxy rebuilds after the 5-minute
hitime grace expires.

**502 unit tests, tsc clean.**

The port is sufficient for live play over telnet. For the full original-vs-port story see
`PORT.md`; for player-facing docs see `GUIDE.md` (player's guide) and `MANUAL.md`
(per-command reference).

## Quick start

Requires **Node ≥ 23.6** (the project is run directly as TypeScript via Node's
built-in type stripping — no build step).

```sh
npm install            # one-time, dev-only deps
node src/main.ts       # starts the telnet server on port 2030
```

From another terminal:

```sh
telnet localhost 2030
```

Configuration via environment variables:

| Var | Purpose | Default |
|-----|---------|---------|
| `DECWAR_PORT` | TCP port the server binds | `2030` |
| `DECWAR_HONOR_PATH` | JSON file the honor roll persists to | `./decwar-honor.json` |
| `DECWAR_TEXT_DIR` | Directory the in-game HELP/NEWS read from (and where GRIPE appends) | `./data` |

## Running the tests

```sh
npm test               # type-check, then run the node:test unit suite
```

The test suite covers RNG draw order, every command path, the lobby state machine, the
"no await in a critical section" static invariant, and persistence I/O.

## Documentation

| File | Audience |
|------|----------|
| `GUIDE.md` | Player's guide — narrative walkthrough, strategy, common mistakes, expert techniques |
| `MANUAL.md` | Captain's manual — per-command reference for all 33 in-game commands |
| `PORT.md` | Original-vs-port comparison — what was preserved, what changed, what was simplified, what was fixed |
| `LICENSE` | GNU General Public License v3 (the project's license) |
| `NOTICE` | Original-author attribution and derivative-work copyright |
| `data/decwar.hlp` | In-game HELP content (served by `HELP <topic>`) |
| `data/decwar.nws` | In-game NEWS content (operator-editable, re-read on each `NEWS` command) |

## Architecture

```
src/
  core/         # game-state types, RNG, board, fixed-point, session
  parser/       # tokenizer + EQUAL keyword matcher
  commands/     # the 33 in-game commands + lobby helpers
  combat/       # damage, nova, romulan, romspk
  comms/        # message bus (hit + radio queues), OUTHIT, OUTMSG
  lifecycle/    # activate, setup (lobby), endgam, universe (build + rebuild)
  movement/     # CHECK (collision)
  render/       # strings, format, output (cursor-tracking write seam)
  runtime/      # event loop, scheduler (post-MOVE world tick), clock
  persistence/  # honor roll, text files (HELP/NEWS/GRIPE)
  telnet/       # TCP server + telnet IO
  main.ts       # entry point
test/
  unit/         # 502 unit tests
  harness/      # ScriptedIo (socket-free test seam)
```

## Fidelity invariants

These rules govern any change to the engine. Violating them risks divergence from the
1978 game.

- **×10 fixed-point.** Energy, damage, shields, scores, base/Romulan strength are stored
  as integers in tenths. Truncate toward zero on store; divide by 10 only in the renderer.
  No `Math.round` on these values.
- **RNG draw order is game state.** Every `iran()` / `ran()` must fire in the same order
  the FORTRAN does. Drawing one early or skipping one desyncs every replay.
- **Board encoding.** Cells are 12-bit `class*100+index`; a stored `7777` (octal) reads
  back as `−1`.
- **Identity bits.** `bits[i] = 2^(i-1)` for **all 18** slots (the source's
  `DATA bits/...` only initializes 1–10, which would black out half the Empire team in
  `pridis` recipient masks; the port corrects this).
- **No await in a critical section.** Every command handler mutates shared state
  synchronously. The only `await` points are at IO seams (`readCommandLine`, `pause`,
  bounded arg-prompt reads). Enforced by `test/unit/no-await-lint.test.ts`.

## License

This project is released under the **GNU General Public License v3 or later** —
both the original DECWAR (under its 2011 GPL re-release) and this TypeScript
derivative.  See `LICENSE` for the full GPL-3 text and `NOTICE` for the full
attribution.  The License-and-attribution callout at the top of this README
is the short version.

## Heritage

The original DECWAR was written in 1978–79 at the University of Texas on the
DEC PDP-10 running TOPS-10, in FORTRAN IV and MACRO-10.  It was preserved and
re-released in 2011 under the GNU General Public License v3 by Bob Hysick,
Jeff Potter, and Harris Newman, in cooperation with what was then the
University of Texas Computation Center.  That 2011 GPL release is the legal
source of truth for the code we ported.

The reconstruction tree used here is `utexas23-reconstruction` — a `kwrun ".."`
re-creation of the 18-player UT version, including the original FORTRAN IV /
MACRO-10 sources.  Earlier CompuServe-era ports (10-ship, billing-gated) are
tracked as separate evolution branches and deliberately excluded from this
port.
