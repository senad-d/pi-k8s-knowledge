export type Input = { question: string; url?: string; version?: string };
export type Request = Input & { supported: boolean };

/** Pure pre-schema guard: Pi otherwise coerces values and echoes invalid arguments. */
export function validateInput(raw: unknown): Input {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid input.");
  const fields = Object.keys(raw);
  const input = raw as Record<string, unknown>;
  if (fields.some((key) => !["url", "question", "version"].includes(key)) ||
      !Object.hasOwn(input, "question")) throw new Error("Invalid input.");
  const result: Input = { question: "" };
  for (const [key, limit] of [["url", 2048], ["question", 4096], ["version", 32]] as const) {
    if (key !== "question" && !Object.hasOwn(input, key)) continue;
    const value = input[key];
    if (typeof value !== "string" || !value.trim() || value.trim().length > limit) throw new Error("Invalid input.");
    result[key] = value.trim();
  }
  return result;
}

export function validateRequest(raw: unknown): Request {
  const input = validateInput(raw);
  const source = input.url === undefined ? undefined : validateSource(input.url);
  return { ...input, ...(source ? { url: source.url } : {}),
    supported: (input.version === undefined || input.version === "latest") && (source?.supported ?? true) };
}

export function validateSource(source: string): { url: string; supported: boolean } {
  if (!source || source.length > 2048) throw new Error("Unsupported source.");
  // Inspect raw syntax before URL normalization can hide traversal or delimiters.
  const parts = /^https:\/\/([^/?#]+)(\/[^?#]*)?(?:#(.*))?$/i.exec(source);
  if (!parts || /[\\\x00-\x1f\x7f-\x9f]/.test(source)) throw new Error("Unsupported source.");
  const path = parts[2] ?? "";
  if (parts[1]!.includes("@") || !/^\/docs(?:\/|$)/.test(path) ||
      !/^[A-Za-z0-9_.~/-]+$/.test(path) || path.includes("//") ||
      path.split("/").some((part) => part === "." || part === "..")) throw new Error("Unsupported source.");
  let url: URL;
  try {
    url = new URL(source);
    if (/[\x00-\x1f\x7f-\x9f]/.test(decodeURIComponent(parts[3] ?? ""))) throw new Error("Unsupported source.");
  } catch {
    throw new Error("Unsupported source.");
  }
  if (url.hostname !== "kubernetes.io" || url.port || url.username || url.password) throw new Error("Unsupported source.");
  url.hash = "";
  const release = /^(?:v|release-)?\d+[.]\d+(?:[.]\d+)?(?:[-+][A-Za-z0-9.-]+)?$/;
  return { url: url.href, supported: !path.split("/").some((part) => release.test(part)) };
}

/** Resolve without allowing URL normalization to conceal raw traversal syntax. */
export function resolveSource(target: string, base: string): string {
  let absolute = target;
  if (target.startsWith("/")) absolute = `https://kubernetes.io${target}`;
  else if (target.startsWith("#")) absolute = `${base}${target}`;
  else if (!/^https:/i.test(target)) absolute = `${base.slice(0, base.lastIndexOf("/") + 1)}${target}`;
  const source = validateSource(absolute);
  if (!source.supported) throw new Error("Unsupported source.");
  return source.url;
}

const MAX_BYTES = 2 * 1024 * 1024;
class RetrievalFailure extends Error {}

function redirectTarget(response: Response, url: string): string | undefined {
  // Fail closed if a host transport ignored manual redirect handling.
  if (response.redirected || (response.url && response.url !== url)) throw new RetrievalFailure("Redirect refused.");
  if (![301, 302, 303, 307, 308].includes(response.status)) return undefined;
  try {
    const target = response.headers.get("location");
    if (!target) throw new Error("Missing redirect location.");
    return resolveSource(target, url);
  } catch { throw new RetrievalFailure("Redirect refused."); }
}

async function fetchRedirects(url: string, signal: AbortSignal, aborted: Promise<never>): Promise<{ url: string; response: Response }> {
  const visited = new Set<string>();
  while (true) {
    if (visited.has(url) || visited.size === 4) throw new RetrievalFailure("Redirect refused.");
    visited.add(url);
    const response = await Promise.race([fetch(url, {
      method: "GET", redirect: "manual", credentials: "omit",
      headers: { Accept: "text/html", "Accept-Language": "en" }, signal,
    }).then((value) => {
      // A host fetch that finishes after cancellation must not leave an unread body.
      if (signal.aborted) void value.body?.cancel().catch(() => {});
      return value;
    }), aborted]);
    let retained = false;
    try {
      const target = redirectTarget(response, url);
      if (!target) { retained = true; return { url, response }; }
      url = target;
      signal.throwIfAborted();
    } finally {
      if (!retained) void response.body?.cancel().catch(() => {});
    }
  }
}

function validateResponse(response: Response): void {
  if (response.status !== 200) throw new RetrievalFailure(`HTTP status ${response.status}.`);
  const media = (response.headers.get("content-type") ?? "").split(";");
  const charsets = media.slice(1).filter((part) => /^\s*charset\s*=/i.test(part));
  if (media[0]!.trim().toLowerCase() !== "text/html" || charsets.some((part) =>
    !/^\s*charset\s*=\s*(?:utf-8|"utf-8")\s*$/i.test(part))) throw new RetrievalFailure("Unsupported document.");
  const length = response.headers.get("content-length");
  if (length !== null && Number(length) > MAX_BYTES) throw new RetrievalFailure("Document too large.");
  if (!response.body) throw new RetrievalFailure("Unsupported document.");
}

function decodeChunk(decoder: TextDecoder, value?: Uint8Array): string {
  try { return decoder.decode(value, { stream: value !== undefined }); }
  catch { throw new RetrievalFailure("Unsupported document."); }
}

async function readBody(reader: ReadableStreamDefaultReader<Uint8Array>, signal: AbortSignal, aborted: Promise<never>): Promise<string> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  const chunks: string[] = [];
  while (true) {
    const { done, value } = await Promise.race([reader.read(), aborted]);
    signal.throwIfAborted();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) throw new RetrievalFailure("Document too large.");
    chunks.push(decodeChunk(decoder, value));
  }
  chunks.push(decodeChunk(decoder));
  return chunks.join("");
}

/** Bounded online HTML retrieval, including at most three validated redirects. */
export async function fetchPage(url: string, signal?: AbortSignal): Promise<{ url: string; html: string }> {
  if (signal?.aborted) throw new Error("Cancelled.");
  const source = validateSource(url);
  if (!source.supported) throw new Error("Unsupported source.");
  url = source.url;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 15_000);
  let rejectAbort: () => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = () => reject(new Error("Cancelled.")); });
  controller.signal.addEventListener("abort", rejectAbort, { once: true });
  let response: Response | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let complete = false;
  try {
    ({ url, response } = await fetchRedirects(url, controller.signal, aborted));
    validateResponse(response);
    reader = response.body!.getReader();
    const html = await readBody(reader, controller.signal, aborted);
    complete = true;
    return { url, html };
  } catch (error) {
    if (controller.signal.aborted) throw new Error(timedOut ? "Timeout." : "Cancelled.");
    if (error instanceof RetrievalFailure) throw new Error(error.message);
    throw new Error("Network failure.");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
    controller.signal.removeEventListener("abort", rejectAbort);
    if (!complete) {
      controller.abort();
      // Do not wait on a remote cancellation acknowledgement to report a deadline.
      void (reader ? reader.cancel() : response?.body?.cancel())?.catch(() => {});
    }
    reader?.releaseLock();
  }
}
