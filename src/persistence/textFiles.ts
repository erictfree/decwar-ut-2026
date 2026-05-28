/**
 * Text-file persistence for HELP / NEWS / GRIPE (G-5). Source:
 *   • HELP — WARMAC.MAC:4977–5100 (reads `DECWAR.HLP`, walks for `.<topic>` sections).
 *   • NEWS — WARMAC.MAC:4625–4676 (streams `DECWAR.NWS` to the terminal).
 *   • GRIPE — WARMAC.MAC:4682–4960 (appends user input to `DECWAR.GRP`).
 *
 * The port preserves the SEMANTICS — sectioned HELP, free-text NEWS, append-only GRIPE —
 * but stores everything on the local filesystem at a configurable directory rather than
 * the PDP-10 disk pack. Embedded fallbacks live in this module so tests + zero-config
 * deploys still work; the production server sets `state.text` to `FileTextStore(path)`
 * with `DECWAR_TEXT_DIR` from env.
 *
 * HELP file format: very simple. A section header is `.TOPIC` on its own line (TOPIC is
 * matched case-insensitively against the requested topic, source equal() semantics); the
 * section extends until the next `.<word>` header (or EOF). The first section before any
 * header is the "general" / no-arg response; an asterisk topic (`*`) is reserved for the
 * command-list page (`HELP *`).
 *
 * Read failures (missing file, unreadable) fall back silently to the embedded text;
 * parse failures (e.g. trailing whitespace) are tolerated by the section walker.
 *
 * Writes (GRIPE) are append-only JSON-Lines for easy `tail -f`; one record per gripe with
 * `{ identity, captain, recordedAt: Date.now(), lines: string[] }`. Failures throw — a
 * GRIPE that can't be persisted should fail loudly so the server operator notices.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

// ── Embedded fallbacks (used when no path is configured or the file is missing) ──────────

export const HELP_GENERAL_FALLBACK = `\r\n\
DECWAR — Federation vs. Empire space-combat game.\r\n\
\r\n\
In-game commands (abbreviate to a unique prefix):\r\n\
  BUILD CAPTURE DAMAGES DOCK ENERGY GRIPE HELP IMPULSE LIST\r\n\
  MOVE NEWS PHASERS PLANETS POINTS QUIT RADIO REPAIR SCAN\r\n\
  SET SHIELDS SRSCAN STATUS SUMMARY TARGETS TELL TIME\r\n\
  TORPEDOS TRACTOR TYPE USERS\r\n\
\r\n\
Type 'HELP *' for a command list, or 'HELP <command>' for details.\r\n`;

export const HELP_STAR_FALLBACK = `\r\n\
BASES BUILD CAPTURE DAMAGES DOCK ENERGY GRIPE HELP IMPULSE\r\n\
LIST MOVE NEWS PHASERS PLANETS POINTS QUIT RADIO REPAIR\r\n\
SCAN SET SHIELDS SRSCAN STATUS SUMMARY TARGETS TELL TIME\r\n\
TORPEDOS TRACTOR TYPE USERS\r\n`;

export const NEWS_FALLBACK = `\r\n\
DECWAR News\r\n\
-----------\r\n\
No news today, Captain.\r\n`;

// ── Types ────────────────────────────────────────────────────────────────────────────────

/** One persisted GRIPE record (one line per gripe in the on-disk JSON-Lines file). */
export interface GripeRecord {
  identity: string;
  captain: string;
  recordedAt: number; // ms since the Unix epoch
  lines: string[];
}

/** The pluggable seam — file-backed in production, in-memory in tests. */
export interface TextStore {
  /** Return the full HELP text for `topic` (case-insensitive). "*" → command-list page; ""
   * (or no topic) → general no-arg HELP page. Always returns a non-empty string. */
  help(topic?: string): string;
  /** Return the full NEWS text. Always returns a non-empty string. */
  news(): string;
  /** Append a GRIPE record. May be a no-op (InMemoryTextStore) or write to disk. */
  appendGripe(record: GripeRecord): void;
  /** Test-only inspector — returns the appended records (no-op for FileTextStore). */
  readonly gripes?: GripeRecord[];
}

// ── HELP section walker ──────────────────────────────────────────────────────────────────

/**
 * Walk a HELP file: split into sections keyed by leading `.HEADER` lines. The text BEFORE
 * the first header is the "general" / no-arg section; subsequent sections are looked up
 * by case-insensitive header name. Lines are joined with CRLF to match the source's
 * terminal output style.
 */
export function parseHelp(text: string): Map<string, string> {
  const sections = new Map<string, string>();
  // Split on any line that starts with a `.` (followed by a non-space, to avoid matching
  // a bare period — which is GRIPE terminator semantics, not HELP).
  const lines = text.split(/\r\n|\n|\r/);
  let currentTopic = ""; // "" = general / pre-header text
  let buf: string[] = [];
  const flush = () => {
    if (buf.length > 0) {
      sections.set(currentTopic, buf.join("\r\n"));
      buf = [];
    }
  };
  for (const line of lines) {
    const m = /^\.(\S+)\s*$/.exec(line);
    if (m) {
      flush();
      currentTopic = m[1]!.toUpperCase();
      continue;
    }
    buf.push(line);
  }
  flush();
  return sections;
}

/** Look up `topic` (case-insensitive) in a parsed HELP map. Returns "" when not found. */
function pickSection(sections: Map<string, string>, topic: string): string {
  if (topic === "") return sections.get("") ?? "";
  return sections.get(topic.toUpperCase()) ?? "";
}

// ── InMemory store (tests / no-config) ───────────────────────────────────────────────────

export class InMemoryTextStore implements TextStore {
  readonly gripes: GripeRecord[] = [];
  readonly #help: Map<string, string>;
  readonly #news: string;

  constructor(opts: { helpText?: string; newsText?: string } = {}) {
    const helpText = opts.helpText ?? `${HELP_GENERAL_FALLBACK}.*\r\n${HELP_STAR_FALLBACK}`;
    this.#help = parseHelp(helpText);
    this.#news = opts.newsText ?? NEWS_FALLBACK;
  }

  help(topic = ""): string {
    const found = pickSection(this.#help, topic);
    if (found !== "") return found;
    // Topic not found → fall back to the general page with a notice.
    if (topic !== "") return `\r\n(No HELP entry for '${topic}'.)\r\n${this.#help.get("") ?? HELP_GENERAL_FALLBACK}`;
    return HELP_GENERAL_FALLBACK;
  }

  news(): string { return this.#news; }

  appendGripe(record: GripeRecord): void { this.gripes.push(record); }
}

// ── File-backed store (production) ───────────────────────────────────────────────────────

/**
 * `dir` is the text-file directory. The store looks for `decwar.hlp`, `decwar.nws`, and
 * appends gripes to `decwar.grp` (JSON-Lines). Missing files → embedded fallback.
 */
export class FileTextStore implements TextStore {
  readonly #dir: string;
  #helpSections: Map<string, string> | null = null; // lazy-loaded

  constructor(dir: string) { this.#dir = dir; }

  #ensureHelpLoaded(): Map<string, string> {
    if (this.#helpSections) return this.#helpSections;
    const path = `${this.#dir}/decwar.hlp`;
    if (!existsSync(path)) {
      this.#helpSections = parseHelp(`${HELP_GENERAL_FALLBACK}.*\r\n${HELP_STAR_FALLBACK}`);
      return this.#helpSections;
    }
    const text = readFileSync(path, "utf8");
    this.#helpSections = parseHelp(text);
    return this.#helpSections;
  }

  help(topic = ""): string {
    const sections = this.#ensureHelpLoaded();
    const found = pickSection(sections, topic);
    if (found !== "") return found;
    if (topic !== "") return `\r\n(No HELP entry for '${topic}'.)\r\n${sections.get("") ?? HELP_GENERAL_FALLBACK}`;
    return HELP_GENERAL_FALLBACK;
  }

  news(): string {
    const path = `${this.#dir}/decwar.nws`;
    if (!existsSync(path)) return NEWS_FALLBACK;
    return readFileSync(path, "utf8");
  }

  appendGripe(record: GripeRecord): void {
    if (!existsSync(this.#dir)) mkdirSync(this.#dir, { recursive: true });
    const path = `${this.#dir}/decwar.grp`;
    if (dirname(path) && !existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify(record)}\n`);
  }
}
