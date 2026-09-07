import assert from "node:assert/strict";
import test from "node:test";
import { parsePage, selectEvidence, serializeEvidence, createCache, parseOrReuse, disposeCache, discoverCandidates } from "../src/evidence.ts";

const url = "https://kubernetes.io/docs/example/";
// Synthetic examples, not official Kubernetes quotations.
function html(article: string, lang = "en"): string {
  return `<html lang="${lang}"><head><base href="https://evil.test/"></head><body>
    <nav><p>startup probe navigation</p></nav><main><div class="other td-content">${article}</div></main></body></html>`;
}
const article = `<h1>Pod examples</h1><h2 id="startup">Startup probe</h2>
  <p>A <em>startup probe</em> waits &amp; checks.\n Keep &amp;lt;literal&amp;gt; words.</p>
  <ul><li>startup probe first<ul><li>startup probe nested</li></ul>startup probe last</li></ul>
  <table><tr><td>startup</td><td>probe</td></tr></table>
  <h2 id="restartPolicy">Container restartPolicy</h2><pre><code>  restartPolicy: Always\n    # restart policy</code></pre>
  <p>restartPolicy controls a container restart.</p>`;

test("extracts nonoverlapping literal prose, lists, cells and indented code", () => {
  const page = parsePage(url, html(article));
  assert.deepEqual(page.blocks.map((block) => block.text), [
    "A startup probe waits & checks. Keep &lt;literal&gt; words.",
    "startup probe first", "startup probe nested", "startup probe last", "startup probe",
    "  restartPolicy: Always\n    # restart policy", "restartPolicy controls a container restart.",
  ]);
  const result = selectEvidence(page, "When should I use a startup probe?");
  assert.equal(result.status, "evidence");
  if (result.status !== "evidence") return;
  assert.equal(result.excerpts[0]!.text, page.blocks[0]!.text);
  assert.equal(result.excerpts[0]!.sectionUrl, `${url}#startup`);
  assert.equal(result.excerpts[0]!.sectionTitle, "Startup probe");
  assert.equal(result.omitted, 0);
  assert.equal(selectEvidence(page, "What does restartPolicy control?").status, "evidence");
  assert.equal(parsePage(url, html("<pre>  first<br>  second</pre>")).blocks[0]!.text, "  first\n  second");
});

test("excluded subtrees cannot match or join nonadjacent passages", () => {
  const hidden = ["script", "style", "template", "noscript", "nav", "footer", "form"]
    .map((tag) => `<${tag}>startup probe SECRET</${tag}>`).join("");
  const page = parsePage(url, html(`<h1>Title</h1>${hidden}
    <p hidden>startup probe</p><p aria-hidden="true">startup probe</p><div lang="fr"><p>startup probe</p></div>
    <p>first<span hidden>secret</span>last<br>line</p><p>ordinary text</p>`));
  assert.deepEqual(page.blocks.map((block) => block.text), ["first", "last line", "ordinary text"]);
  assert.deepEqual(selectEvidence(page, "startup probe"), { status: "no_evidence", sourceUrl: url, message: "No relevant evidence found." });
});

test("only explicit English article layouts are supported, never whole-body fallback", () => {
  for (const document of [html(article, "fr"), html(article, ""), "<html><main><div class=td-content>startup probe</div></main></html>",
    html(article).replace("<main>", "<main></main><main>"), html(article).replace("td-content", "not-content"),
    html(`${article}<div class=td-content>extra</div>`), html(article).replace("<main>", '<main lang="fr">')]) {
    assert.throws(() => parsePage(url, document), { message: "Unsupported document." });
  }
  assert.ok(parsePage(url, html(article, "en-US")).blocks.length);
});

test("citations use unique real heading IDs or explicit page-level fallback", () => {
  const page = parsePage(url, html(`<h1>Title</h1><p>startup probe page</p>
    <h2 id="duplicate">One</h2><p>startup probe one</p><h2 id="duplicate">Two</h2><p>startup probe two</p>
    <h2 id="${"x".repeat(257)}">Long</h2><p>startup probe long</p>
    <h2 id="bad&#10;id">Control</h2><p>startup probe control</p>
    <h2 id="real &amp; ü">Real</h2><h3>No ID</h3><p>startup probe anchored</p>`));
  for (const block of page.blocks.slice(0, 5)) {
    assert.equal(block.sectionUrl, url);
    assert.match(block.sectionTitle, /page-level/);
  }
  assert.equal(page.blocks.at(-1)!.sectionUrl, `${url}#real%20%26%20%C3%BC`);
  assert.equal(page.blocks.at(-1)!.sectionTitle, "Real");
  const outsideDuplicate = html('<h2 id="same">Real</h2><p>startup probe</p>').replace("<nav>", '<nav id="same">');
  assert.equal(parsePage(url, outsideDuplicate).blocks[0]!.sectionUrl, url);
});

test("ranking is deterministic, preserves ties and duplicates, requires body and combined matches", () => {
  const page = parsePage(url, html(`<h1>startup probe</h1><p>startup only</p><p>probe only</p>
    <p>startup probe both</p><p>startup probe both</p><p>no body match</p>`));
  const result = selectEvidence(page, "startup probe probe");
  assert.equal(result.status, "evidence");
  if (result.status !== "evidence") return;
  assert.deepEqual(result.excerpts.map((item) => item.text), ["startup probe both", "startup probe both", "startup only", "probe only"]);
  assert.deepEqual(selectEvidence(page, "startup probe probe"), result);
  for (const question of ["how should I use Kubernetes?", "zebra spaceship", "!!!"]) {
    assert.equal(selectEvidence(page, question).status, "no_evidence");
  }
  assert.equal(selectEvidence(parsePage(url, html("<p>startup only</p>")), "startup probe").status, "no_evidence");
});

test("large late-match windows are contiguous Unicode-safe quotes with disclosed omissions", () => {
  for (const body of ["😀é ".repeat(1200) + "startup probe " + "尾 ".repeat(1500),
    "  line\n".repeat(100) + "startup probe\n" + " line\n".repeat(100),
    "\n".repeat(200) + "startup probe\n" + "\n".repeat(200), "a".repeat(2000)]) {
    const page = parsePage(url, html(`<h1>Title</h1>${Array.from({ length: 8 }, () => `<pre>${body}</pre>`).join("")}`));
    const query = body.startsWith("a") ? body : "startup probe";
    const result = selectEvidence(page, query);
    assert.equal(result.status, "evidence");
    if (result.status !== "evidence") continue;
    assert.equal(result.excerpts.length, 5);
    assert.equal(result.omitted, 3);
    for (const item of result.excerpts) {
      assert.equal(item.partial, true);
      assert.ok(body.includes(item.text));
      assert.ok(Buffer.byteLength(item.text) <= 1200);
      assert.ok(item.text.split("\n").length <= 80);
      assert.equal(Buffer.from(item.text).toString("utf8"), item.text);
      assert.ok(item.text.includes(body.startsWith("a") ? "a" : "startup"));
    }
    const serialized = serializeEvidence(result);
    assert.ok(Buffer.byteLength(serialized) <= 16384);
    assert.ok(serialized.split("\n").length <= 1000);
    assert.deepEqual(JSON.parse(serialized), result);
  }
});

test("JSON size drops whole lowest-ranked excerpts, never cuts quotes or URLs", () => {
  const source = `https://kubernetes.io/docs/${"x".repeat(1950)}/`;
  const page = parsePage(source, html(Array.from({ length: 5 }, (_, i) =>
    `<h2 id="${"ü".repeat(127)}${i}">${"文".repeat(160)}</h2><pre>startup probe ${"&#1;".repeat(1100)}</pre>`).join("")));
  const result = JSON.parse(serializeEvidence(selectEvidence(page, "startup probe")));
  assert.ok(result.excerpts.length > 0 && result.excerpts.length < 5);
  assert.equal(result.omitted, 5 - result.excerpts.length);
  assert.equal(result.sourceUrl, source);
  assert.ok(result.excerpts.every((item: { sectionUrl: string }) => item.sectionUrl.startsWith(`${source}#`)));
});

test("catalog discovery ranks titles and paths deterministically and rejects missing or hidden catalogs", () => {
  const links = `<a href="/docs/z/">Startup probe</a><a href="/docs/a/">startup</a>
    <a href="/docs/startup/">unrelated</a><a href="/docs/z/#again">startup</a>`;
  const document = html(article).replace("<nav>", `<nav class=td-sidebar-nav>${links}`);
  const expected = ["https://kubernetes.io/docs/z/", "https://kubernetes.io/docs/a/", "https://kubernetes.io/docs/startup/"];
  assert.deepEqual(discoverCandidates(url, document, "startup probe"), expected);
  assert.deepEqual(discoverCandidates(url, document.replace(links, links.match(/<a[^>]*>.*?<\/a>/g)!.reverse().join("")), "startup probe"), expected);
  assert.deepEqual(discoverCandidates(url, document, "zebra spaceship"), []);
  for (const bad of [html(article), document.replace("td-sidebar-nav", "other"),
    document.replace("<nav", "<nav hidden"), document.replace("<nav", "<nav lang=fr"),
    document.replace("<nav", "<div lang=fr><nav").replace("</nav>", "</nav></div>"),
    document.replace("</nav>", "</nav><nav class=td-sidebar-nav></nav>")]) {
    assert.throws(() => discoverCandidates(url, bad, "startup probe"), { message: "Unsupported document." });
  }
});

const lifetime = 30 * 24 * 60 * 60 * 1000;

test("single-slot reuse never renews insertion time and only publishes complete parsed pages", (t) => {
  let wall = 1000;
  t.mock.method(Date, "now", () => wall);
  const state = createCache();
  try {
    assert.equal(state.timer, undefined);
    const first = parseOrReuse(state, url, html(article));
    const inserted = state.slot!.insertedWallTime;
    wall += 100;
    assert.equal(parseOrReuse(state, url, html(article)), first);
    assert.equal(state.slot!.insertedWallTime, inserted);
    assert.deepEqual(selectEvidence(first, "startup probe"), selectEvidence(parsePage(url, html(article)), "startup probe"));
    assert.throws(() => parseOrReuse(state, url, "bad"), /Unsupported document/);
    assert.equal(state.slot!.parsedPage, first);
    assert.notEqual(parseOrReuse(state, url, html(article + "<p>new</p>")), first);
    assert.notEqual(parseOrReuse(state, `${url}other/`, html(article)), first);
  } finally { disposeCache(state); }
  assert.equal(state.slot, undefined);
  assert.equal(state.timer, undefined);
  disposeCache(state);
  assert.throws(() => parseOrReuse(state, url, html(article)), { message: "Cancelled." });
  assert.equal(createCache().slot, undefined);
});

test("automatic deadline uses the final 1ms timer and neither hits nor timer checks renew it", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let wall = 1000;
  let mono = 0;
  t.mock.method(Date, "now", () => wall);
  t.mock.method(process.hrtime, "bigint", () => BigInt(mono) * 1_000_000n);
  const scheduler = t.mock.method(globalThis, "setTimeout");
  const state = createCache();
  try {
    assert.equal(scheduler.mock.callCount(), 0);
    parseOrReuse(state, url, html(article));
    wall += lifetime - 1;
    mono = lifetime - 1;
    t.mock.timers.tick(60_000);
    assert.ok(state.slot);
    assert.equal(scheduler.mock.calls.at(-1)!.arguments[1], 1);
    wall++;
    mono++;
    t.mock.timers.tick(1);
    assert.equal(state.slot, undefined); // No lookup/tool call at expiry.
    assert.equal(state.timer, undefined);
    assert.ok(scheduler.mock.calls.every((call) => Number(call.arguments[1]) <= 60_000));
  } finally { disposeCache(state); }
});

test("independent wall/monotonic expiry and backward jumps remove automatically after paused scheduling", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let wall = 0;
  let mono = 0;
  t.mock.method(Date, "now", () => wall);
  t.mock.method(process.hrtime, "bigint", () => BigInt(mono) * 1_000_000n);
  for (const scenario of ["sleep", "monotonic", "backward", "before-insertion", "operation", "backward-operation"]) {
    wall = 1000;
    mono = 0;
    const state = createCache();
    try {
      const first = parseOrReuse(state, url, html(article));
      if (scenario === "monotonic") mono = lifetime;
      else if (scenario === "backward" || scenario === "backward-operation") {
        wall += lifetime / 3;
        parseOrReuse(state, url, html(article));
        wall -= lifetime / 6; // Still later than insertion, but earlier than last observation.
      } else if (scenario === "before-insertion") wall = 999;
      else wall += lifetime + 1;
      if (scenario.endsWith("operation")) {
        assert.notEqual(parseOrReuse(state, url, html(article)), first);
      } else {
        assert.ok(state.slot); // Scheduler paused, old reference still owned until callback runs.
        t.mock.timers.tick(60_000);
        assert.equal(state.slot, undefined);
        assert.equal(state.timer, undefined);
      }
    } finally { disposeCache(state); }
  }
});

test("replacement near an old deadline is not deleted by the old timer", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let wall = 1000;
  t.mock.method(Date, "now", () => wall);
  t.mock.method(process.hrtime, "bigint", () => 0n);
  const state = createCache();
  try {
    parseOrReuse(state, url, html(article));
    wall += lifetime - 1;
    t.mock.timers.tick(60_000);
    const replacement = parseOrReuse(state, url, html("<p>changed page</p>"));
    wall++;
    t.mock.timers.tick(1);
    assert.equal(state.slot!.parsedPage, replacement);
    disposeCache(state);
    t.mock.timers.tick(60_000);
    assert.equal(state.timer, undefined);
  } finally { disposeCache(state); }
});
