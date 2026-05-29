# DECWAR: 1978 Original vs. TypeScript Port

A readable comparison of what changed, what was preserved, and what was fixed when porting
the 1978 PDP-10 FORTRAN/MACRO-10 game to a 2026 Node.js telnet server.

---

## TL;DR

The game you play is the same game. The engine underneath is different.

| | 1978 Original | 2026 TS Port |
|---|---|---|
| **Hardware** | DEC PDP-10 (36-bit, ~250 KIPS) | Whatever runs Node ≥ 23.6 |
| **OS** | TOPS-10 | macOS / Linux / Windows |
| **Language** | FORTRAN IV (~4600 lines) + MACRO-10 assembly | TypeScript (~10K lines), Node-native |
| **Compile** | `compile/comp decwar, high, low, setup, warmac, msg, setmsg` + LINK | None — Node 23.6 type-strips at load |
| **Concurrency** | TOPS-10 cooperative job scheduling, one job per terminal | One async session per TCP socket; single-threaded JS event loop |
| **I/O** | Blocking `input.`/`output.` to TTY:; ^C as a soft trap | Async `readCommandLine` over a telnet socket |
| **Persistence** | `DECWAR.STA` (binary stats), `DECWAR.HLP`, `DECWAR.NWS`, `DECWAR.GRP` | JSON `decwar-honor.json`, JSON-Lines `decwar.grp`, plain text `decwar.hlp`/`.nws` |
| **Distribution** | Tape image, source compiled in-place | `npm install && node src/main.ts` |
| **Players** | 18 (9 per side) | 18 |
| **Galaxy** | 75 × 75 sectors | 75 × 75 sectors |
| **Ships, weapons, formulas** | as written in 1978 | preserved exactly |

The governing rule throughout: **change the machinery, not the game**.

## What was preserved exactly

### Game mechanics

Every formula, every RNG draw, every magic number from the FORTRAN — copied across with
source-line citations. A few examples:

- **Energy cost of MOVE:** `40 × ia²` per sector (DECWAR.FOR:~1150)
- **Phaser overheat threshold:** `iran(100) × phit > 18900` (DECWAR.FOR:2676)
- **Phaser damage:** `((100 + iran(100)) × phit) / (10 × id)` where `id` is range
  (DECWAR.FOR:2697-ish)
- **Torpedo damage:** `4000 + 4000 × ran()` (in tenths)
- **Shield/energy conversion:** 25 internal energy units : 1 shield charge unit
  (DECWAR.FOR:3763, the SHIELD constant)
- **Romulan health on spawn:** `iran(200) + 200`
- **Black hole count:** `iran(41) + 10` → 10..50
- **Star count:** `5 × iran(51) + 100` → 100..355 (exactly the source's distribution)

### RNG draw order

The 1978 RNG (`ran.` / `iran.` in WARMAC.MAC) is a 36-bit multiplicative generator. The
TS port replicates it bit-for-bit using JavaScript `BigInt`. Crucially, every command
handler draws values in **the exact order** the FORTRAN does — because RNG draw order
is observable game state. A single misplaced `iran()` would desync every replay.

The audit pass during Phase G specifically checked NOVA/SNOVA/JUMP and ROMTOR/ROMSTR
RNG sequences against the source, and found one inversion bug (see "What was fixed"
below).

### Player-facing text

Every message string — combat results, command prompts, banners, "Captain, the impulse
engines won't take it." — is copied byte-for-byte from `MSG.MAC` and `SETMSG.MAC`. The
ENDGAM banners include the Federation's "Congratulations. Freedom again reigns the
galaxy." and the Empire's "Initiate self-destruction procedure." verbatim. The
Romulan's "You will witness my vengence" preserves the original typo.

### The 33 in-game commands

The full command table from `DECWAR.FOR:436–469` is preserved in `commands/table.ts`,
in the same dispatch order. Abbreviations work via the same prefix-match rules
(`equal()`) as the source.

### Object encoding and the board

The board is still a 75×75 grid of 12-bit cells encoded `class × 100 + index`, with `7777`
(octal) reading back as `−1` (the source's "out of galaxy" sentinel). Object classes
(FSHP, ESHP, FBAS, EBAS, ROM, NPLN, FPLN, EPLN, STAR, BHOL, MPTY) keep their original
values.

### Fixed-point arithmetic

Energy, damage, shields, and scores are stored as integers in tenths (×10), exactly as
in FORTRAN, and divided by 10 only at the display layer. There is no `Math.round`
anywhere in the engine. The OFLT render preserves the truncation-toward-zero semantics
of `idivi` on the PDP-10.

## What changed (technology-forced)

These are the only places the port deviates from the source.

### 1. Hardware abstraction

| FORTRAN / MACRO-10 | TS Port |
|--------------------|---------|
| `/hiseg/` COMMON block (shared game state) | `GameState` interface, single object held by the server |
| `/lowseg/` COMMON block (per-job private state) | `Session` interface, one per TCP socket |
| `cctrap`, `clrbuf`, `dmpbuf` (^C handling) | `TelnetIO.onCtrlC` callback → `session.ccflg` |
| `daytim`, `etim`, `runtim` (PDP-10 system calls) | `Clock` interface (SystemClock / FakeClock) |
| `lock`, `unlock` (TOPS-10 sequencing) | not needed — single-threaded JS |
| `ttyon`, `ttyoff`, `echoff`, `echon` | telnet ECHO/SGA/NAWS negotiation |
| `dpb`, `ldb` (byte-pointer bit manipulation) | regular JS arithmetic |

### 2. Concurrency model

The 1978 game runs as one TOPS-10 job per terminal, with the monitor cooperatively
switching between them. Shared state (`/hiseg/`) is protected by `lock`/`unlock` and
by the discipline that any time-consuming command yields control before returning.

The TS port has one event loop and one `Session` per TCP socket. The "no await in a
critical section" invariant (enforced by a static lint in
`test/unit/no-await-lint.test.ts`) guarantees that any command handler mutates shared
state synchronously — `await` only appears at IO seams (`readCommandLine`, `pause`).
This reproduces the original's serialization guarantee without needing the
locks.

### 3. I/O

The original called `out.` / `outc.` / `out2c.` / `crlf` / `tab` — direct writes to
TTY: with the PDP-10's display tracking the cursor position via the `hcpos` global.
The TS port has a parallel `out(session, text)` seam that does the same cursor tracking
in `session.hcpos` / `session.blank`, so the source's 40-column wrap (in OUTHIT) and
left-margin blank-line suppression (in `ocrl`) still work.

Telnet adds: ECHO/SGA/NAWS option negotiation, IAC byte filtering, in-band ^C detection.

### 4. Pacing

The 1978 game paces output to slow terminals using `pause(ms)` so a 110-baud Teletype
doesn't drown in scroll. Per-command `ptime` budgets:

- MOVE: `slwest × 1000 + 1000` ms
- DOCK: `slwest × 1000 + 1000`
- BUILD: `slwest × 1000 + 4000`
- CAPTURE: `5000 + buildCount × 1000`
- REPAIR: `(repsiz × 8) / mode`

The TS port preserves these but routes through `session.io.pause(ms)` — the test
`ScriptedIo` makes this instant, while `TelnetSocketIO` uses real `setTimeout`. So
the source-faithful pacing is observable on a real telnet session and invisible in
tests.

### 5. Persistence

| Source | Port |
|--------|------|
| `DECWAR.STA` (binary high-roller stats) | `decwar-honor.json` (JSON, atomic temp+rename) |
| `DECWAR.HLP` (sectioned help text) | `data/decwar.hlp` (same format, `.<TOPIC>` headers) |
| `DECWAR.NWS` (free-form news) | `data/decwar.nws` (plain text) |
| `DECWAR.GRP` (gripe log) | `data/decwar.grp` (JSON-Lines, one record per line) |

All paths configurable via env vars (`DECWAR_HONOR_PATH`, `DECWAR_TEXT_DIR`). Each
store has an in-memory fallback for tests.

### 6. The kill queue

Source identifies returning players by `(ttynum, jobnum, ppn)` — the TOPS-10 process
triple. There's no equivalent on Node. The port uses
`session.identity = "<remoteAddress>:<remotePort>"` as the stable key — so a player
who dies and immediately reconnects on the same socket gets kill-queue continuity. A
new TCP connection from the same machine on a different port is treated as a different
player.

This is the only **semantic** technology-forced change. It matters because:

- A returning player whose old ship is still free reincarnates into it (no re-prompts).
- A player whose side is now full gets the DEFECT prompt.
- A player whose old ship was taken gets the REASSIGNED prompt.

### 7. The clock

Source has `daytim` (24-hour wall clock modulo) and `etim` (monotonic-ish elapsed).
Port has a `Clock` interface with `now()` (wall) and `monotonic()`. Production wires
`SystemClock`; tests use `FakeClock` with `advance(ms)`. The 5-minute hitime grace
expiry test works exactly the same way as a real player waiting 5 minutes — just
without waiting.

## What was simplified or deferred

A small set of source features the port doesn't fully implement, with reasons.

### KILCHK (5-minute reincarnation wait)

The source's `KILCHK` subroutine forces a recently-killed player to wait `KWAIT` ms
before respawning. **It's dead code in the reconstruction**: `PARAM.FOR` sets `kwait=0`
and the subroutine is defined but never called. The kill-queue tracking (KQADD on
death, KQSRCH on revive) is fully implemented; only the wait countdown is deferred.

### CompuServe-specific features

The reconstruction tree carries vestigial CompuServe code (account checks, document
purchase, terminal-type tables). These are flagged-and-excluded by the governing
spec; the port doesn't implement them. See `CLAUDE.md` for the source-precedence rule.

A full CompuServe-leakage audit was performed comparing the
`utexas23-reconstruction/` (UT 18-player) tree against the root CompuServe v2.3 tree
and the TypeScript port. Five CompuServe-only features were identified —
`LOFCHK` session time-gating, the `DECWAF.STA` "free user" dual honor-roll file,
the `CISHNG.MAC` hang-up intercept, the `drforbin/merlyn/tofix` developer markers,
and `KNPLAY=10` — and **none** appear in the port. Result: clean.

### TOPS-10 system features

Things that simply don't exist on Node:
- `lock`/`unlock` (no other jobs to serialize against)
- `jobsta` (no PDP-10 job table to read)
- `usrprj`/`lofchk` (no CompuServe-style billing)
- `setran(daytim)` re-seeding per player (would break test determinism; preserved
  only at tournament-name reseed)
- `kilhgh` (no shared high-segment to swap out of memory)

The HELP corpus (`data/decwar.hlp`) also lost two topics that describe TOPS-10
features the port cannot reproduce: `.DECINI` (the `DECWAR.INI` startup-script
mechanism, which reads from "the UFD of the logged in PPN" — User File Directory
and Project-Programmer-Number, both TOPS-10 file-system concepts) and `.CTL-T`
(typing `^T` at the TOPS-10 monitor to inspect which of `DECWAR / DECWTI /
DECWRN / DECWSL` the program is in — a TOPS-10-only process-status convention).
Both topics described features that have no analog on Node, so leaving them in
HELP would have misled players. The form-feed bytes used as PDP-10 printer
page-breaks were also stripped from the file; their side effect was hiding
the `.INPUT` and `.BASES` topics from the parser, so the strip restored them
as visible topics.

### Honor-roll display

The source's `shosta` includes a runtime-and-date column populated by TOPS-10 system
calls (`getlin`, time-zone code). The port omits those columns, displaying
`Captain | Ship | Score` instead. The honor-roll persistence model (per-side top-5,
alive/dead split, sort-by-score) is exact.

## What was fixed

A handful of source-acknowledged corrections. Each is documented in the code with
source citations.

### 1. `bits[]` initialized for all 18 slots

Source `DECWAR.FOR:507` DATA-initializes `bits(i) = 2^(i-1)` for `i = 1..10` only.
With `knplay = 18`, slots 11–18 would have a zero identity bit, which would black
out half the Empire team in any `pridis` recipient mask. The port initializes
all 18. (Analysis Deliverable #5 §6 Q1, #12 §2.1.)

### 2. SNOVA chain condition inversion (Phase G-8)

Source `DECWAR.FOR:3808` reads:

```
200    if ((object .ne. DXSTAR) .or. (iran(5) .eq. 5))  goto 300
       if (strptr .eq. 29)  goto 300
       strptr = strptr + 1
       strstk(strptr,1) = V  ;  strstk(strptr,2) = H
```

Stars chain into the supernova cascade when `iran(5) ≠ 5` — i.e. 4/5 of the time.
The TS port's first cut used `iran(5) === 5` (1/5), making chains a rare event
instead of the dramatic norm the source intended. Caught during the Phase G defensive
audit; one-line fix with a regression test.

### 3. JS double-precision in the damage formula

The source does some intermediate arithmetic with `real ihita` — a single-precision
PDP-10 float. JS numbers are doubles. Where this matters (the `(100 + iran(100)) ×
phit / (10 × id)` phaser-damage product), the port uses `Math.trunc()` at the
right step to match the source's truncation. The diff was characterized as **OQ-1
(JS-double seam)** and confirmed not load-bearing for correctness; full byte-level
SIMH validation is out of scope.

### 4. Romulan kill-message routing

Source `ROMSPK` is called from TELL ROMULAN — when the player addresses the
Romulan, the Romulan responds with a single-player taunt. The port adds an
additional spawn-time broadcast trigger (1-in-10 chance via the existing `iran(10)`
draw) so a Romulan can announce its arrival, which is consistent with the source's
intent but not literally a source call site. The 4-part taunt-body composition,
audience routing, and the random-quip fallback (skipping the TOPS-10 node-name
lookup) are all source-faithful.

## Architecture mapping

The clean separation the port enforces between modules mirrors (loosely) the source's
include-file structure:

| Source include | Port module |
|----------------|-------------|
| `PARAM.FOR` (constants) | `src/core/constants.ts` |
| `HISEG.FOR` (shared game state) | `src/core/state.ts` (the `GameState` interface) |
| `LOWSEG.FOR` (per-job state) | `src/core/session.ts` (the `Session` interface) |
| `MSG.MAC` / `SETMSG.MAC` (strings) | `src/render/strings.ts` |
| `WARMAC.MAC` (utilities) | `src/render/format.ts`, `src/render/output.ts`, `src/core/rng.ts`, `src/core/board.ts` |
| `DECWAR.FOR` (command handlers) | `src/commands/*.ts` |
| `SETUP.FOR` (lobby) | `src/lifecycle/setup.ts`, `lobby.ts`, `activate.ts` |

The deepest combat / NPC / weapon subroutines live in `src/combat/`:

| Source | Port |
|--------|------|
| `PHACON`, `PHADAM` | `src/commands/phasers.ts`, `src/combat/damage.ts` |
| `TORCON`, `TORDAM` | `src/commands/torpedos.ts`, `src/combat/damage.ts` |
| `ROMDRV`, `PHAROM`, `TOROM`, `DEADRO` | `src/combat/romulan.ts` |
| `ROMTOR`, `ROMSTR` | `src/combat/romulan.ts` |
| `ROMSPK` | `src/combat/romspk.ts` |
| `NOVA`, `SNOVA`, `JUMP` | `src/combat/nova.ts` |
| `ENDGAM` | `src/lifecycle/endgam.ts` |

And the world tick (post-MOVE processing):

| Source | Port |
|--------|------|
| `BASBLD` (base build), `BASPHA` (base defense fire) | `src/runtime/scheduler.ts` |
| `PLNATK` (planet defense fire) | same |
| `RDODAM` (radio/life-support tick) | same |
| `BASKIL` (un-dock orphaned ships) | same |
| `CHECK` / `CHKPNT` (movement collision) | `src/movement/check.ts` |

## Testing

The port has **468 unit tests** (vs. zero in the source — there's no test infrastructure
on TOPS-10 for this kind of game) covering:

- Every command path with source-pinned assertions
- The full RNG-draw-order audit
- Hit/score formulas across the 15 OUTHIT iwhat cases
- Lobby flow (first-player prompts, side selection, ship selection, reincarnation)
- Kill-queue defect/reassigned/reuse paths
- ENDGAM detection in all three end-states (1 / -2 / running)
- 5-minute galaxy rebuild after grace
- Persistence (honor roll, gripe log, HELP file loading)
- The "no await in critical section" static invariant

There's no SIMH byte-level validation — Eric's call. The bar is "correct telnet
behavior", which is satisfied. If anyone ever wants to pursue full byte-level
fidelity against a SIMH run of the original, the deferred OQ-1 / OQ-9 are the
known seams to investigate.

## Source-of-truth discipline

A few principles that govern the port's relationship to the source:

- **Source wins.** When source contradicts docs, comments, historical memory, or any
  prior implementation, the source is the truth.
- **Don't invent.** Missing mechanics are flagged `Open Question: requires manual
  review` rather than filled with plausible game-design guesses.
- **Don't modernize.** Strange behavior in the source isn't smoothed over unless
  the source itself proves it was unintended (the `bits[]` fix, the SNOVA chain
  inversion).
- **Don't convert.** Fixed-point ×10 stays ×10. The RNG stays a 36-bit
  multiplicative generator. The MSG.MAC strings stay verbatim.

This is a compatibility port, not a remake.

## Further reading

- `MANUAL.md` — the captain's manual (how to play)
- `INSTRUCTIONS.md` (in the parent directory) — the governing spec for the port
- `CLAUDE.md` (parent dir) — the source-of-truth discipline summary
- `analysis/` (parent dir) — the 16 deliverables from the archaeology phase
- The source: `decwar source and associated files/utexas/utexas23-reconstruction/`
