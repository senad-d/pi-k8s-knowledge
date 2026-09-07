import assert from "node:assert/strict";
import test from "node:test";
import { fetchPage, validateInput, validateRequest, resolveSource } from "../src/retrieval.ts";

const url = "https://kubernetes.io/docs/concepts/pods/";
const input = { url, question: "startup probe" };

test("normalizes strict input without echoing rejected values", () => {
  assert.deepEqual(validateInput({ url: ` ${url} `, question: " startup probe ", version: " latest " }),
    { ...input, version: "latest" });
  for (const raw of [null, [], {}, { url }, { ...input, question: " " },
    { ...input, url: null }, { ...input, question: 3 }, { ...input, version: null },
    { ...input, version: undefined }, { ...input, extra: "SECRET" },
    { ...input, question: "x".repeat(4097) }, { ...input, url: "x".repeat(2049) },
    { ...input, version: "x".repeat(33) }, { ...input, version: " " }]) {
    assert.throws(() => validateInput(raw), { message: "Invalid input." });
  }
});

test("authorizes only unambiguous English documentation page URLs", () => {
  for (const source of ["http://kubernetes.io/docs/", "https://user:SECRET@kubernetes.io/docs/",
    "https://@kubernetes.io/docs/", "https://kubernetes.io:444/docs/",
    "https://kubernetes.io.evil/docs/", "https://v1-20.docs.kubernetes.io/docs/",
    "https://kubernetes.io/zh/docs/", "https://kubernetes.io/blog/", "https://kubernetes.io/docs-evil/",
    `${url}?`, `${url}?SECRET`, `${url}../pods/`, `${url}./pods/`, `${url}%2e%2e/`,
    `${url}%70ods/`, `${url}/pods`, `${url}\\pods`, `${url}\npods`, `${url}a:b`,
    `${url}#bad%`, `${url}#bad%0a`, "/docs/", "https:kubernetes.io/docs/",
    "https://kubernetes.io./docs/", "https://kubernetes.io", "https://kubernetes.io#docs",
    `https://${"a".repeat(2000)}?`, `https://${"a".repeat(2000)}/?`]) {
    assert.throws(() => validateRequest({ ...input, url: source }), { message: "Unsupported source." }, source);
  }
  for (const source of [url, "https://kubernetes.io/docs", "https://kubernetes.io:443/docs/",
    `${url}#section%20one`, `${url}#one#two?three`, "https://kubernetes.io/docs/reference/v1beta1/"]) {
    const request = validateRequest({ ...input, url: source });
    assert.equal(request.supported, true);
    assert.equal(request.url, new URL(source.split("#")[0]!).href);
  }
});

test("classifies every explicit release selector and release-pinned path unsupported", () => {
  for (const version of ["1.20", "99.2.0", "v1.35.0-beta.1", "unknown", "LATEST"]) {
    assert.equal(validateRequest({ ...input, version }).supported, false);
  }
  for (const release of ["v1.20", "1.20.2", "release-1.20", "v1.20.0-beta.1"]) {
    assert.equal(validateRequest({ ...input, url: `${url}${release}/` }).supported, false);
  }
});

test("fetches an authorized fragment-free endpoint with no question or credentials", async (t) => {
  const spy = t.mock.method(globalThis, "fetch", async () => new Response('<a href="/docs/B/">B</a>',
    { headers: { "content-type": "text/html; charset=UTF-8" } }));
  assert.deepEqual(await fetchPage(validateRequest({ ...input, url: `${url}#one` }).url!),
    { url, html: '<a href="/docs/B/">B</a>' });
  assert.equal(spy.mock.callCount(), 1);
  const [target, options] = spy.mock.calls[0]!.arguments as unknown as [string, RequestInit];
  assert.equal(target, url);
  assert.equal(options.method, "GET");
  assert.equal(options.redirect, "manual");
  assert.equal(options.credentials, "omit");
  assert.deepEqual(options.headers, { Accept: "text/html", "Accept-Language": "en" });
  assert.equal(options.body, undefined);
});

test("refuses unsafe redirects, loops and HTTP errors without consuming or exposing their bodies", async (t) => {
  for (const status of [301, 302, 303, 307, 308, 304, 401, 403, 404, 429, 500]) {
    for (const location of ["", url, "https://evil.test/SECRET", "/docs/v1.20/", "/zh/docs/",
      "/blog/", "/docs/../docs/", "/docs/%2e/", "https://user:SECRET@kubernetes.io/docs/", "/docs/?SECRET"]) {
      let cancelled = false;
      const stream = new ReadableStream({ cancel() { cancelled = true; } });
      const spy = t.mock.method(globalThis, "fetch", async () => new Response(status === 304 ? null : stream,
        { status, headers: { location } }));
      const message = [301, 302, 303, 307, 308].includes(status)
        ? "Redirect refused."
        : `HTTP status ${status}.`;
      await assert.rejects(fetchPage(url), { message });
      assert.equal(spy.mock.callCount(), 1);
      if (status !== 304) assert.equal(cancelled, true);
      spy.mock.restore();
    }
  }
});

test("follows only validated redirects within one bounded chain and reports final source identity", async (t) => {
  for (const status of [301, 302, 303, 307, 308]) {
    let cancelled = false;
    const spy = t.mock.method(globalThis, "fetch", async (target: Parameters<typeof globalThis.fetch>[0]) => target === url
      ? new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status, headers: { location: "other/#section" } })
      : new Response("<p>literal</p>", { headers: { "content-type": "text/html" } }));
    assert.deepEqual(await fetchPage(url), { url: `${url}other/`, html: "<p>literal</p>" });
    assert.deepEqual(spy.mock.calls.map((call) => call.arguments[0]), [url, `${url}other/`]);
    assert.equal(cancelled, true);
    spy.mock.restore();
  }
  const allowed = [url, `${url}one/`, `${url}one/two/`, `${url}one/two/three/`];
  const boundary = t.mock.method(globalThis, "fetch", async (target: Parameters<typeof globalThis.fetch>[0]) => {
    const index = allowed.indexOf(String(target));
    assert.notEqual(index, -1);
    return index === allowed.length - 1
      ? new Response("<p>literal</p>", { headers: { "content-type": "text/html" } })
      : new Response(null, { status: 302, headers: { location: `${allowed[index + 1]!}#section` } });
  });
  assert.deepEqual(await fetchPage(url), { url: allowed.at(-1), html: "<p>literal</p>" });
  assert.deepEqual(boundary.mock.calls.map((call) => call.arguments[0]), allowed);
  boundary.mock.restore();

  const spy = t.mock.method(globalThis, "fetch", async (target: Parameters<typeof globalThis.fetch>[0]) => new Response(null,
    { status: 302, headers: { location: `${target}next/` } }));
  await assert.rejects(fetchPage(url), { message: "Redirect refused." });
  assert.equal(spy.mock.callCount(), 4);
  spy.mock.restore();
  const unexpected = new Response("SECRET", { headers: { "content-type": "text/html" } });
  Object.defineProperty(unexpected, "url", { value: "https://evil.test/" });
  t.mock.method(globalThis, "fetch", async () => unexpected);
  await assert.rejects(fetchPage(url), { message: "Redirect refused." });
});

test("discovered and direct fetch targets cannot bypass raw source validation", async (t) => {
  const spy = t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected network"); });
  for (const target of ["https://evil.test/", "https://kubernetes.io/docs/v1.20/", `${url}../escape/`]) {
    await assert.rejects(fetchPage(target), { message: "Unsupported source." });
  }
  for (const target of ["../escape/", "./escape/", "//evil.test/", "http://kubernetes.io/docs/",
    "javascript:alert(1)", "/docs/%2e/", "/docs/\\nsecret/", "/docs/\\\\secret/", "/docs/a/?secret"])
    assert.throws(() => resolveSource(target, url), { message: "Unsupported source." });
  assert.equal(resolveSource("#section", `${url}page.html`), `${url}page.html`);
  assert.equal(spy.mock.callCount(), 0);
});

test("rejects unsupported media types, charsets and invalid UTF-8", async (t) => {
  for (const contentType of ["text/plain", "application/json", "text/html; charset=iso-8859-1",
    "text/html; charset=UTF-8; charset=latin1", ""]) {
    const spy = t.mock.method(globalThis, "fetch", async () => new Response("SECRET", { headers: { "content-type": contentType } }));
    await assert.rejects(fetchPage(url), { message: "Unsupported document." });
    spy.mock.restore();
  }
  for (const bytes of [[0xc3, 0x28], [0xc3]]) {
    const spy = t.mock.method(globalThis, "fetch", async () => new Response(new Uint8Array(bytes),
      { headers: { "content-type": "text/html" } }));
    await assert.rejects(fetchPage(url), { message: "Unsupported document." });
    spy.mock.restore();
  }
});

test("bounds declared and actual decoded bytes and releases the stream", async (t) => {
  for (const length of [undefined, "1", "2097153"]) {
    let cancelled = false;
    const body = new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1)); },
      cancel() { cancelled = true; },
    });
    const headers: Record<string, string> = { "content-type": "text/html" };
    if (length) headers["content-length"] = length;
    const spy = t.mock.method(globalThis, "fetch", async () => new Response(body, { headers }));
    await assert.rejects(fetchPage(url), { message: "Document too large." });
    assert.equal(cancelled, true);
    assert.equal(body.locked, false);
    spy.mock.restore();
  }
});

test("sanitizes network failures and pre-cancellation with zero pre-abort requests", async (t) => {
  const spy = t.mock.method(globalThis, "fetch", async () => { throw new Error("SECRET /local/path"); });
  await assert.rejects(fetchPage(url, AbortSignal.abort("SECRET")), { message: "Cancelled." });
  assert.equal(spy.mock.callCount(), 0);
  await assert.rejects(fetchPage(url), { message: "Network failure." });
});

test("strict decoding spans chunks and a partial stream failure is never a partial success", async (t) => {
  const bytes = new TextEncoder().encode("<p>é😀</p>");
  let body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
      controller.close();
    },
  });
  t.mock.method(globalThis, "fetch", async () => new Response(body, { headers: { "content-type": "text/html" } }));
  assert.deepEqual(await fetchPage(url), { url, html: "<p>é😀</p>" });
  let reads = 0;
  body = new ReadableStream<Uint8Array>({ pull(controller) {
    if (reads++ === 0) controller.enqueue(bytes);
    else controller.error(new Error("SECRET partial body"));
  } });
  await assert.rejects(fetchPage(url), { message: "Network failure." });
  assert.equal(body.locked, false);
});

test("deadline covers stalled headers and body; mid-stream cancellation releases readers", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const phase of ["headers", "body", "cancel"]) {
    let cancelled = false;
    const body = new ReadableStream({ cancel() { cancelled = true; } });
    const controller = new AbortController();
    const spy = t.mock.method(globalThis, "fetch", () => phase === "headers" ? new Promise<Response>(() => {})
      : Promise.resolve(new Response(body, { headers: { "content-type": "text/html" } })));
    const pending = fetchPage(url, controller.signal);
    const rejection = assert.rejects(pending, { message: phase === "cancel" ? "Cancelled." : "Timeout." });
    // Let headers resolve and the reader enter its first read.
    await new Promise<void>((resolve) => setImmediate(resolve));
    if (phase === "cancel") controller.abort("SECRET");
    else t.mock.timers.tick(15_000);
    await rejection;
    if (phase !== "headers") {
      assert.equal(cancelled, true);
      assert.equal(body.locked, false);
    }
    spy.mock.restore();
  }
});
