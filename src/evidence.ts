import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import { truncateHead } from "@earendil-works/pi-coding-agent";
import { resolveSource } from "./retrieval.ts";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
type Heading = { level: number; title: string; id?: string };
type Block = { text: string; headings: string[]; sectionTitle: string; sectionUrl: string };
export type ParsedPage = { sourceUrl: string; title: string; blocks: Block[] };
type Excerpt = { text: string; sectionTitle: string; sectionUrl: string; partial: boolean };
export type Evidence =
  | { status: "evidence"; sourceUrl: string; excerpts: Excerpt[]; omitted: number }
  | { status: "no_evidence"; sourceUrl: string; message: "No relevant evidence found." };

const ignoredTags = new Set(["script", "style", "template", "noscript", "nav", "footer", "form"]);
const boundaries = new Set(["p", "li", "pre", "tr", "div", "section", "blockquote", "ul", "ol", "table", "dl", "dt", "dd"]);
const english = /^en(?:-[a-z0-9]+)*$/i;

function attr(node: Element, name: string): string | undefined {
  return node.attrs.find((item) => item.name === name)?.value;
}

function ignored(node: Element, allowNavigation = false): boolean {
  const lang = attr(node, "lang");
  return (ignoredTags.has(node.tagName) && !(allowNavigation && node.tagName === "nav")) || attr(node, "hidden") !== undefined ||
    attr(node, "aria-hidden")?.toLowerCase() === "true" || (lang !== undefined && !english.test(lang)) ||
    /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\s*(?:!important\s*)?(?:;|$)/i.test(attr(node, "style") ?? "");
}

/** Iterative traversal avoids call-stack limits on deeply nested remote HTML. */
function* nodes(root: Node): Generator<Node> {
  const stack = [root];
  while (stack.length) {
    const node = stack.pop()!;
    yield node;
    if ("childNodes" in node) {
      for (let i = node.childNodes.length - 1; i >= 0; i--) stack.push(node.childNodes[i]!);
    }
  }
}

function prose(text: string): string {
  return text.replace(/[\t\n\f\r ]+/g, " ").replace(/^ | $/g, "");
}

function label(text: string): string {
  return Array.from(text).slice(0, 160).join("");
}

function headingText(root: Element): string {
  const stack: Node[] = [root];
  const text: string[] = [];
  while (stack.length) {
    const node = stack.pop()!;
    if ("tagName" in node && ignored(node)) { text.push(" "); continue; }
    if (node.nodeName === "#text") text.push((node as DefaultTreeAdapterMap["textNode"]).value);
    if ("tagName" in node && node.tagName === "br") text.push(" ");
    if ("childNodes" in node) {
      for (let i = node.childNodes.length - 1; i >= 0; i--) stack.push(node.childNodes[i]!);
    }
  }
  return prose(text.join(""));
}

type Extraction = { page: ParsedPage; headings: Heading[]; run: string[]; pre: boolean };
function flush(state: Extraction): void {
  const raw = state.run.join("");
  state.run = [];
  const text = state.pre ? raw.replace(/\r\n?/g, "\n") : prose(raw);
  if (!text.trim()) return;
  const section = [...state.headings].reverse().find((heading) => heading.id !== undefined);
  state.page.blocks.push({
    text, headings: state.headings.map((heading) => heading.title),
    sectionTitle: section ? label(section.title) : `${Array.from(state.page.title).slice(0, 147).join("")} (page-level)`,
    sectionUrl: section ? `${state.page.sourceUrl}#${encodeURIComponent(section.id!)}` : state.page.sourceUrl,
  });
}

function checkVisibleAncestors(root: Element, allowNavigation = false): void {
  for (let node: Node | null = root; node; node = "parentNode" in node ? node.parentNode : null) {
    if ("tagName" in node && ignored(node, allowNavigation)) throw new Error("Unsupported document.");
  }
}

function findArticle(elements: Element[]): Element {
  const root = elements.find((node) => node.tagName === "html");
  const mains = elements.filter((node) => node.tagName === "main");
  if (!root || !english.test(attr(root, "lang") ?? "") || mains.length !== 1) throw new Error("Unsupported document.");
  const articles = [...nodes(mains[0]!)].filter((node): node is Element =>
    "tagName" in node && (attr(node, "class") ?? "").split(/\s+/).includes("td-content"));
  if (articles.length !== 1 || articles[0] === mains[0]) throw new Error("Unsupported document.");
  checkVisibleAncestors(articles[0]!);
  return articles[0]!;
}

function addHeading(state: Extraction, node: Element, ids: Map<string, number>): void {
  flush(state);
  const title = headingText(node);
  const level = Number(node.tagName[1]);
  if (level === 1 && !state.page.title) state.page.title = title;
  const rawId = attr(node, "id");
  const id = rawId && ids.get(rawId) === 1 && Buffer.byteLength(rawId) <= 256 &&
    !/[\x00-\x1f\x7f-\x9f]/.test(rawId) ? rawId : undefined;
  state.headings = state.headings.filter((item) => item.level < level);
  state.headings.push({ level, title, id });
}

function extractNode(state: Extraction, node: Node, exit: boolean, ids: Map<string, number>): boolean {
  if (node.nodeName === "#text") {
    state.run.push((node as DefaultTreeAdapterMap["textNode"]).value);
    return false;
  }
  if (!("tagName" in node)) return false;
  if (ignored(node)) { flush(state); return false; }
  if (/^h[1-6]$/.test(node.tagName)) { addHeading(state, node, ids); return false; }
  if (boundaries.has(node.tagName)) flush(state);
  if (node.tagName === "pre") state.pre = !exit;
  if (node.tagName === "br" && !exit) state.run.push(state.pre ? "\n" : " ");
  if (node.tagName === "td" || node.tagName === "th") state.run.push(" ");
  return !exit;
}

export function parsePage(sourceUrl: string, html: string): ParsedPage {
  try {
    const document = parse(html);
    const all = [...nodes(document)];
    const elements = all.filter((node): node is Element => "tagName" in node);
    const article = findArticle(elements);
    const ids = new Map<string, number>();
    for (const node of elements) {
      const id = attr(node, "id");
      if (id !== undefined) ids.set(id, (ids.get(id) ?? 0) + 1);
    }
    const state: Extraction = { page: { sourceUrl, title: "", blocks: [] }, headings: [], run: [], pre: false };
    const stack: { node: Node; exit: boolean }[] = [{ node: article, exit: false }];
    while (stack.length) {
      const { node, exit } = stack.pop()!;
      if (!extractNode(state, node, exit, ids) || !("childNodes" in node)) continue;
      stack.push({ node, exit: true });
      for (let i = node.childNodes.length - 1; i >= 0; i--) stack.push({ node: node.childNodes[i]!, exit: false });
    }
    flush(state);
    return state.page;
  } catch {
    throw new Error("Unsupported document.");
  }
}

const stopwords = new Set("a an and are as at be by can do does for from how i in is it kubernetes of on or should that the this to use was what when where which why with".split(" "));

/** Match normalization with offsets back into the unchanged source string. */
function tokens(text: string): { value: string; index: number }[] {
  const result: { value: string; index: number }[] = [];
  let value = "";
  let start = 0;
  let index = 0;
  let previous = "";
  for (const char of text) {
    if (/[a-z]/.test(previous) && /[A-Z]/.test(char) && value) {
      result.push({ value, index: start }); value = "";
    }
    for (const lower of char.toLowerCase()) {
      if (/[a-z0-9]/.test(lower)) {
        if (!value) start = index;
        value += lower;
      } else if (value) {
        result.push({ value, index: start }); value = "";
      }
    }
    previous = char;
    index += char.length;
  }
  if (value) result.push({ value, index: start });
  return result;
}

function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

function addCandidate(node: Element, sourceUrl: string, query: Set<string>, candidates: Map<string, number>): void {
  const href = attr(node, "href");
  if (!href) return;
  let url: string;
  try { url = resolveSource(href, sourceUrl); } catch { return; } // Catalogs also link to excluded sources.
  if (url === sourceUrl) return;
  const title = new Set(tokens(headingText(node)).map((token) => token.value).filter((token) => query.has(token)));
  const path = new Set(tokens(new URL(url).pathname).map((token) => token.value).filter((token) => query.has(token)));
  const score = 2 * title.size + path.size;
  if (score) candidates.set(url, Math.max(score, candidates.get(url) ?? 0));
}

/** The official docs home embeds the documentation catalog in its sidebar. */
export function discoverCandidates(sourceUrl: string, html: string, question: string): string[] {
  const all = [...nodes(parse(html))];
  const root = all.find((node): node is Element => "tagName" in node && node.tagName === "html");
  const catalogs = all.filter((node): node is Element => "tagName" in node && node.tagName === "nav" &&
    (attr(node, "class") ?? "").split(/\s+/).includes("td-sidebar-nav"));
  if (!root || !english.test(attr(root, "lang") ?? "") || catalogs.length !== 1) throw new Error("Unsupported document.");
  checkVisibleAncestors(catalogs[0]!, true);
  const query = new Set(tokens(question).map((token) => token.value).filter((token) => !stopwords.has(token)));
  const candidates = new Map<string, number>();
  const stack: Node[] = [catalogs[0]!];
  while (stack.length) {
    const node = stack.pop()!;
    if ("tagName" in node && ignored(node, true)) continue;
    if ("tagName" in node && node.tagName === "a") addCandidate(node, sourceUrl, query, candidates);
    if ("childNodes" in node) stack.push(...node.childNodes);
  }
  // ponytail: title/path lexical shortlist misses body-only terms and synonyms;
  // use an official full-text index if broader recall is required, never guessed URLs.
  return [...candidates].sort((a, b) => b[1] - a[1] || compareStrings(a[0], b[0]))
    .slice(0, 5).map(([url]) => url);
}

function windowEnd(text: string, start: number): number {
  let bytes = 0;
  let lines = 1;
  let end = start;
  for (const char of text.slice(start)) {
    bytes += Buffer.byteLength(char);
    if (char === "\n") lines++;
    if (bytes > 1200 || lines > 80) break;
    end += char.length;
  }
  return end;
}

function excerpt(block: Block, match: number): Excerpt {
  let start = 0;
  let end = windowEnd(block.text, start);
  if (end < block.text.length) {
    start = Math.max(0, match - 160);
    if (/[\uDC00-\uDFFF]/.test(block.text[start]!)) start++;
    end = windowEnd(block.text, start);
    if (end <= match) { start = match; end = windowEnd(block.text, start); }
  }
  return { text: block.text.slice(start, end), sectionTitle: block.sectionTitle,
    sectionUrl: block.sectionUrl, partial: start > 0 || end < block.text.length };
}

export function selectEvidence(page: ParsedPage, question: string): Evidence {
  const query = new Set(tokens(question).map((token) => token.value).filter((token) => !stopwords.has(token)));
  const candidates: { block: Block; position: number; score: number; first: number }[] = [];
  // ponytail: lexical matching misses synonyms; replace ranking only if semantic recall is required.
  for (const [position, block] of page.blocks.entries()) {
    const matches = tokens(block.text).filter((token) => query.has(token.value));
    const body = new Set(matches.map((token) => token.value));
    const heading = new Set(tokens(block.headings.join(" ")).map((token) => token.value).filter((token) => query.has(token)));
    if (body.size && new Set([...body, ...heading]).size >= Math.min(2, query.size)) {
      candidates.push({ block, position, score: 2 * body.size + heading.size, first: matches[0]!.index });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.position - b.position);
  if (!candidates.length) return { status: "no_evidence", sourceUrl: page.sourceUrl, message: "No relevant evidence found." };
  return { status: "evidence", sourceUrl: page.sourceUrl,
    excerpts: candidates.slice(0, 5).map((candidate) => excerpt(candidate.block, candidate.first)),
    omitted: Math.max(0, candidates.length - 5) };
}

export function serializeEvidence(result: Evidence): string {
  const bounded = result.status === "evidence" ? { ...result, excerpts: [...result.excerpts] } : result;
  while (true) {
    const text = JSON.stringify(bounded);
    if (!truncateHead(text, { maxBytes: 16 * 1024, maxLines: 1000 }).truncated) return text;
    // Drop whole lowest-ranked passages, never emit cut JSON or broken citations.
    if (bounded.status !== "evidence" || bounded.excerpts.length <= 1) throw new Error("Unsupported document.");
    bounded.excerpts.pop();
    bounded.omitted++;
  }
}

const LIFETIME = 30 * 24 * 60 * 60 * 1000;
type Slot = { sourceUrl: string; sha256: string; parsedPage: ParsedPage; insertedWallTime: number; insertedMonotonicTime: number };
export type Cache = {
  slot?: Slot; lastObservedWallTime?: number; timer?: ReturnType<typeof setTimeout>; closed: boolean;
  directory?: string; diskTimer?: ReturnType<typeof setTimeout>; diskLastWallTime?: number;
  deadlines?: Map<string, number>;
};

export function createCache(): Cache { return { closed: false }; }

function monotonic(): number { return Number(process.hrtime.bigint() / 1_000_000n); }

function clearCache(state: Cache): void {
  clearTimeout(state.timer);
  state.timer = undefined;
  state.slot = undefined;
  state.lastObservedWallTime = undefined;
}

function remaining(state: Cache): number {
  if (!state.slot) return 0;
  const wall = Date.now();
  const left = LIFETIME - Math.max(wall - state.slot.insertedWallTime, monotonic() - state.slot.insertedMonotonicTime);
  if (wall < state.lastObservedWallTime! || left <= 0) { clearCache(state); return 0; }
  state.lastObservedWallTime = wall;
  return left;
}

function armExpiry(state: Cache): void {
  clearTimeout(state.timer);
  state.timer = undefined;
  const left = remaining(state);
  if (left > 0) state.timer = setTimeout(armExpiry, Math.min(60_000, left), state).unref();
}

/** Only called synchronously after a successful new GET; never a retrieval fallback. */
export function parseOrReuse(state: Cache, sourceUrl: string, html: string): ParsedPage {
  if (state.closed) throw new Error("Cancelled.");
  const records = state.directory ? sweepDisk(state) : [];
  remaining(state);
  const sha256 = createHash("sha256").update(html).digest("hex");
  if (state.slot?.sourceUrl === sourceUrl && state.slot.sha256 === sha256) return state.slot.parsedPage;
  const stored = state.directory ? readStored(state, records, sourceUrl, sha256, html) : undefined;
  const parsedPage = parsePage(sourceUrl, stored?.html ?? html);
  // Publish only after successful parsing; failed retrieval never reaches this function.
  if (state.directory && !stored) persistDocument(state, sourceUrl, sha256, html);
  // ponytail: one parsed page per instance; disk retains one current body per source URL.
  clearCache(state);
  const insertedWallTime = stored?.inserted ?? Date.now();
  state.slot = { sourceUrl, sha256, parsedPage, insertedWallTime,
    insertedMonotonicTime: monotonic() - (Date.now() - insertedWallTime) };
  state.lastObservedWallTime = state.slot.insertedWallTime;
  armExpiry(state);
  return parsedPage;
}

/**
 * Releases owned references, not forensic RAM erasure or Pi's independent transcript.
 * Runtime timers cannot run during sleep/event-loop blockage. On resumption the next
 * automatic check (<=60s runnable timer time) removes overdue data; every operation
 * enforces expiry before reuse. Disk documents survive shutdown; the next session
 * automatically sweeps overdue files before any tool use, even without a request.
 */
export function disposeCache(state: Cache): void {
  // Check the deadline once more, but never disclose filesystem failures on shutdown.
  if (state.directory && !state.closed) { try { sweepDisk(state); } catch {} }
  state.closed = true;
  clearCache(state);
  clearTimeout(state.diskTimer);
  state.diskTimer = undefined;
  state.deadlines?.clear();
  state.diskLastWallTime = undefined;
}

const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
const recordName = /^(\d{1,16})-([a-f0-9]{64})-([a-f0-9]{64})-([a-f0-9-]{36})\.(html|tmp)$/;
type DiskRecord = { name: string; inserted: number; sourceHash: string; bodyHash: string };

function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }

function removeRecord(directory: string, name: string): void {
  try { fs.unlinkSync(join(directory, name)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
}

/** Runs at session_start, never from the extension factory. No retrieval occurs here. */
export function startCache(state: Cache, directory: string): void {
  if (state.closed || state.directory) return;
  state.directory = directory;
  state.deadlines = new Map();
  checkDisk(state);
}

function ensureDirectory(directory: string): void {
  const parent = dirname(directory);
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  if (!fs.lstatSync(parent).isDirectory()) throw new Error("Cache parent is not a directory.");
  fs.mkdirSync(directory, { mode: 0o700, recursive: true });
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || (stat.mode & 0o077) !== 0) throw new Error("Cache directory is not private.");
}

function checkDisk(state: Cache): void {
  if (state.closed) return;
  try { sweepDisk(state); }
  catch {
    // A removed/read-only volume cannot be cleaned while inaccessible. Retry without
    // exposing internals; tool operations fail with an ordinary sanitized error.
    clearCache(state);
    clearTimeout(state.diskTimer);
    state.diskTimer = setTimeout(checkDisk, 60_000, state).unref();
  }
}

function retainNewest(directory: string, records: DiskRecord[], deadlines: Map<string, number>): DiskRecord[] {
  records.sort((a, b) => a.inserted - b.inserted || compareStrings(a.name, b.name));
  const newest = new Map(records.map((record) => [record.sourceHash, record.bodyHash]));
  const retained: DiskRecord[] = [];
  for (const record of records) {
    // Only delete a body superseded by a strictly newer immutable record in this
    // snapshot. Interleaved writers must never mutually delete their replacements.
    if (record.bodyHash !== newest.get(record.sourceHash)) {
      removeRecord(directory, record.name);
      deadlines.delete(record.name);
    } else retained.push(record);
  }
  return retained;
}

function touchRecord(path: string, wall: number): boolean {
  try { fs.utimesSync(path, wall / 1000, wall / 1000); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/** Immutable record names make deletion safe against another process publishing a replacement. */
function sweepDisk(state: Cache): DiskRecord[] {
  try {
    const directory = state.directory!;
    ensureDirectory(directory);
    const wall = Date.now();
    const backward = state.diskLastWallTime !== undefined && wall < state.diskLastWallTime;
    const records: DiskRecord[] = [];
    const deadlines = new Map<string, number>();
    let latestWall = wall;
    let delay = 60_000;
    // ponytail: O(n) directory sweep; add an index only if documentation volume warrants it.
    for (const name of fs.readdirSync(directory)) {
      const match = recordName.exec(name);
      if (!match) continue; // Never delete unrelated user files.
      const path = join(directory, name);
      const stat = fs.lstatSync(path, { throwIfNoEntry: false });
      if (!stat) continue;
      const inserted = Number(match[1]);
      // Another process can update mtime after this sweep starts. Observe clocks per
      // record so its newer timestamp is not mistaken for a local wall rollback.
      const observedWall = Date.now();
      const observedMonotonic = monotonic();
      latestWall = Math.max(latestWall, observedWall);
      const deadline = Math.min(state.deadlines?.get(name) ?? Infinity,
        observedMonotonic + LIFETIME - (observedWall - inserted));
      if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_DOCUMENT_BYTES || backward ||
          inserted > observedWall || Math.round(stat.mtimeMs) > observedWall ||
          observedWall - inserted >= LIFETIME || observedMonotonic >= deadline) {
        removeRecord(directory, name);
        clearCache(state);
        continue;
      }
      // Persist the last observed wall time, not a sliding insertion/expiry date.
      if (!touchRecord(path, observedWall)) continue;
      deadlines.set(name, deadline);
      delay = Math.min(delay, Math.max(1, deadline - observedMonotonic));
      if (match[5] === "html") records.push({ name, inserted, sourceHash: match[2]!, bodyHash: match[3]! });
    }
    const retained = retainNewest(directory, records, deadlines);
    state.deadlines = deadlines;
    state.diskLastWallTime = latestWall;
    clearTimeout(state.diskTimer);
    state.diskTimer = setTimeout(checkDisk, delay, state).unref();
    return retained;
  } catch { throw new Error("Documentation retrieval failed."); }
}

function readRecord(path: string): string | undefined {
  let fd: number;
  try { fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_DOCUMENT_BYTES) throw new Error("Invalid cache document.");
    // Read at most the observed bounded size plus one byte, even if a file grows.
    const bytes = Buffer.alloc(stat.size + 1);
    let size = 0;
    while (size < bytes.length) {
      const count = fs.readSync(fd, bytes, size, bytes.length - size, size);
      if (!count) break;
      size += count;
    }
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, size));
  } catch { return ""; }
  finally { fs.closeSync(fd); }
}

function readStored(state: Cache, records: DiskRecord[], sourceUrl: string, sha256: string, html: string):
  { html: string; inserted: number } | undefined {
  try {
    for (const record of records) {
      if (record.sourceHash !== digest(sourceUrl) || record.bodyHash !== sha256) continue;
      const stored = readRecord(join(state.directory!, record.name));
      if (stored === undefined) continue;
      // Local files cannot supply altered evidence: compare with this call's successful GET.
      if (stored === html) return { html: stored, inserted: record.inserted };
      removeRecord(state.directory!, record.name);
    }
    return undefined;
  } catch { throw new Error("Documentation retrieval failed."); }
}

function persistDocument(state: Cache, sourceUrl: string, sha256: string, html: string): void {
  const directory = state.directory!;
  const sourceHash = digest(sourceUrl);
  const inserted = Date.now();
  const base = `${inserted}-${sourceHash}-${sha256}-${randomUUID()}`;
  const temporary = `${base}.tmp`;
  try {
    if (Buffer.byteLength(html) > MAX_DOCUMENT_BYTES) throw new Error("Document too large.");
    fs.writeFileSync(join(directory, temporary), html, { flag: "wx", mode: 0o600 });
    fs.utimesSync(join(directory, temporary), inserted / 1000, inserted / 1000);
    fs.renameSync(join(directory, temporary), join(directory, `${base}.html`));
    sweepDisk(state);
  } catch {
    try { removeRecord(directory, temporary); } catch {}
    throw new Error("Documentation retrieval failed.");
  }
}
