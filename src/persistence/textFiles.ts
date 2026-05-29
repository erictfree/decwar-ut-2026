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
  /**
   * Return HELP text. Semantics match the source DECWAR22.HLP convention:
   *   - `""` (no topic)  → the whole file, verbatim (intro + every section)
   *   - `"*"`            → the list of available topic names (a TOC)
   *   - `"<TOPIC>"`      → just that section (case-insensitive). On miss, falls back
   *                        to a notice + the TOC so the user can see what's available.
   * Always returns a non-empty string.
   */
  help(topic?: string): string;
  /** Return the full NEWS text. Always returns a non-empty string. */
  news(): string;
  /** Append a GRIPE record. May be a no-op (InMemoryTextStore) or write to disk. */
  appendGripe(record: GripeRecord): void;
  /** Test-only inspector — returns the appended records (no-op for FileTextStore). */
  readonly gripes?: GripeRecord[];
}

// ── HELP section walker ──────────────────────────────────────────────────────────────────

/** Parsed HELP file: the raw text (for the no-arg "whole file" output), the per-topic
 *  sections (key = uppercase topic name; "" = pre-header intro), and the topic-name list
 *  (preserves source order) for the `HELP *` TOC. */
export interface ParsedHelp {
  raw: string;
  sections: Map<string, string>;
  topics: string[]; // in source order
}

/**
 * Walk a HELP file: capture the raw text, split into sections keyed by leading `.HEADER`
 * lines (source DECWAR22.HLP convention), and track the ordered topic list for the
 * `HELP *` TOC.  The text BEFORE the first header is the "intro" section (key = ""); the
 * header form is a leading `.` followed by a non-whitespace topic name (avoids matching
 * a bare `.` which is the GRIPE terminator).
 */
export function parseHelp(text: string): ParsedHelp {
  const sections = new Map<string, string>();
  const topics: string[] = [];
  const lines = text.split(/\r\n|\n|\r/);
  let currentTopic = ""; // "" = intro / pre-header text
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
      topics.push(currentTopic);
      continue;
    }
    // Source DECWAR.HLP uses a lone `.` line as a section terminator (the next non-header
    // text belongs to no topic until the next `.<TOPIC>` header).  Close out the current
    // section and drop subsequent lines until either a new header or another lone `.`.
    if (/^\.\s*$/.test(line)) {
      flush();
      currentTopic = "__between__"; // sentinel: not the intro, not any topic
      continue;
    }
    if (currentTopic !== "__between__") buf.push(line);
  }
  flush();
  sections.delete("__between__");
  return { raw: text, sections, topics };
}

/**
 * Format the topic list (HELP *) as a clean multi-column page.  Source's DECWAR.HLP
 * doesn't include a TOC; this is a small ergonomic addition.
 */
function renderTopicList(topics: readonly string[]): string {
  const lines: string[] = ["", "HELP topics available:", ""];
  const colWidth = 12; // 12 chars + 1 space = 13-wide cells
  const cols = 5;
  for (let i = 0; i < topics.length; i += cols) {
    const row = topics.slice(i, i + cols).map((t) => t.padEnd(colWidth)).join(" ").trimEnd();
    lines.push(`  ${row}`);
  }
  lines.push("");
  lines.push("Type 'HELP <topic>' for details, or 'HELP' for the full manual.");
  lines.push("");
  return lines.join("\r\n");
}

/**
 * Look up `topic` in a parsed HELP file, applying the source-faithful semantics:
 *   - `""` → raw whole file
 *   - `"*"` → topic TOC
 *   - `"<TOPIC>"` → that section, or a "no entry" notice + TOC fallback
 *
 * Matching is prefix-based (source's EQUAL): the user's input matches any section name
 * that starts with it, case-insensitively.  This matters because the tokenizer truncates
 * tokens to 5 characters (PDP-10 A5 packing), so `HELP PHASERS` arrives here as `PHASE`
 * and has to match the `PHASERS` section.  Exact wins over prefix; an ambiguous prefix
 * (multiple sections share it) falls back to the TOC.
 */
function dispatchHelp(parsed: ParsedHelp, topic: string, fallback: string): string {
  if (topic === "") return parsed.raw || fallback;
  if (topic === "*") return renderTopicList(parsed.topics);
  const key = topic.toUpperCase();
  const exact = parsed.sections.get(key);
  if (exact !== undefined && exact !== "") return exact;
  const candidates = parsed.topics.filter((t) => t.startsWith(key));
  if (candidates.length === 1) {
    const section = parsed.sections.get(candidates[0]!);
    if (section !== undefined && section !== "") return section;
  }
  return `\r\n(No HELP entry for '${topic}'.)\r\n${renderTopicList(parsed.topics)}`;
}

// ── InMemory store (tests / no-config) ───────────────────────────────────────────────────

export class InMemoryTextStore implements TextStore {
  readonly gripes: GripeRecord[] = [];
  readonly #help: ParsedHelp;
  readonly #news: string;

  constructor(opts: { helpText?: string; newsText?: string } = {}) {
    const helpText = opts.helpText ?? HELP_GENERAL_FALLBACK;
    this.#help = parseHelp(helpText);
    this.#news = opts.newsText ?? NEWS_FALLBACK;
  }

  help(topic = ""): string {
    return dispatchHelp(this.#help, topic, HELP_GENERAL_FALLBACK);
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
  #help: ParsedHelp | null = null; // lazy-loaded

  constructor(dir: string) { this.#dir = dir; }

  #ensureHelpLoaded(): ParsedHelp {
    if (this.#help) return this.#help;
    const path = `${this.#dir}/decwar.hlp`;
    if (!existsSync(path)) {
      this.#help = parseHelp(HELP_GENERAL_FALLBACK);
      return this.#help;
    }
    const text = readFileSync(path, "utf8");
    this.#help = parseHelp(text);
    return this.#help;
  }

  help(topic = ""): string {
    return dispatchHelp(this.#ensureHelpLoaded(), topic, HELP_GENERAL_FALLBACK);
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
