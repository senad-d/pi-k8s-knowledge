import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import fs from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createCache, startCache, disposeCache, parseOrReuse, selectEvidence } from "../src/evidence.ts";

const url = "https://kubernetes.io/docs/example/";
const html = "<html lang=en><main><div class=td-content><h1>Example</h1><p>startup probe waits.</p></div></main></html>";
const lifetime = 30 * 24 * 60 * 60 * 1000;

function directory(t: TestContext): string {
  fs.mkdirSync(".pi", { recursive: true });
  const root = fs.mkdtempSync(join(process.cwd(), ".pi", "k8s-persistence-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return join(root, "documents");
}

function names(path: string): string[] { return fs.readdirSync(path).sort(); }

const child = `
  import { createCache, startCache, parseOrReuse, selectEvidence, disposeCache } from './src/evidence.ts';
  Date.now = () => Number(process.argv[2]);
  const state = createCache();
  startCache(state, process.argv[1]);
  const page = parseOrReuse(state, ${JSON.stringify(url)}, ${JSON.stringify(html)});
  console.log(JSON.stringify({ inserted: state.slot.insertedWallTime, evidence: selectEvidence(page, 'startup probe') }));
  if (process.argv[3] !== 'crash') disposeCache(state);
`;

test("documentation survives fresh Node processes without renewing insertion time", (t) => {
  const path = directory(t);
  const inserted = Date.now() - 1000;
  const first = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", child, path, String(inserted), "crash"], { encoding: "utf8" });
  assert.equal(first.status, 0, first.stderr);
  const files = names(path);
  assert.equal(files.length, 1);
  assert.ok(files[0]!.endsWith(".html"));
  assert.equal(fs.readFileSync(join(path, files[0]!), "utf8"), html);
  assert.equal(fs.statSync(path).mode & 0o777, 0o700);
  assert.equal(fs.statSync(join(path, files[0]!)).mode & 0o777, 0o600);
  const second = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", child, path, String(Date.now()), "shutdown"], { encoding: "utf8" });
  assert.equal(second.status, 0, second.stderr);
  assert.deepEqual(JSON.parse(first.stdout), JSON.parse(second.stdout));
  assert.equal(JSON.parse(second.stdout).inserted, inserted);
  assert.deepEqual(names(path), files); // No replacement, lifetime extension or transcript persistence.
});

test("identical document bodies remain isolated by source URL across restart", (t) => {
  const path = directory(t);
  const otherUrl = "https://kubernetes.io/docs/other/";
  const first = createCache();
  startCache(first, path);
  parseOrReuse(first, url, html);
  parseOrReuse(first, otherUrl, html);
  disposeCache(first);
  const files = names(path);
  assert.equal(files.length, 2);

  const restarted = createCache();
  try {
    startCache(restarted, path);
    for (const sourceUrl of [url, otherUrl]) {
      const result = selectEvidence(parseOrReuse(restarted, sourceUrl, html), "startup probe");
      assert.equal(result.sourceUrl, sourceUrl);
      if (result.status === "evidence") {
        assert.ok(result.excerpts.every((excerpt) => excerpt.sectionUrl === sourceUrl));
      }
    }
    assert.deepEqual(names(path), files); // Both records were reused, not replaced or conflated by body hash.
  } finally { disposeCache(restarted); }
});

test("persistent decoding preserves leading Unicode text without renewing the record", (t) => {
  let wall = 1000;
  t.mock.method(Date, "now", () => wall);
  const path = directory(t);
  const document = "\uFEFF" + html;
  const first = createCache();
  startCache(first, path);
  parseOrReuse(first, url, document);
  disposeCache(first);
  const files = names(path);
  wall++;
  const restarted = createCache();
  try {
    startCache(restarted, path);
    parseOrReuse(restarted, url, document);
    assert.deepEqual(names(path), files);
    assert.equal(restarted.slot!.insertedWallTime, 1000);
  } finally { disposeCache(restarted); }
});

test("session startup removes expired committed and interrupted writes without lookup or network", (t) => {
  const path = directory(t);
  let wall = 1000;
  t.mock.method(Date, "now", () => wall);
  const fetch = t.mock.method(globalThis, "fetch", () => { throw new Error("Unexpected network"); });
  const first = createCache();
  startCache(first, path);
  parseOrReuse(first, url, html);
  disposeCache(first);
  const committed = names(path)[0]!;
  const temporary = committed.replace(/\.html$/, ".tmp");
  fs.copyFileSync(join(path, committed), join(path, temporary));
  fs.utimesSync(join(path, temporary), wall / 1000, wall / 1000);
  fs.writeFileSync(join(path, "unrelated.txt"), "leave alone");
  wall += lifetime;
  assert.equal(names(path).length, 3); // Nothing can execute while all runtimes are stopped.
  const restarted = createCache();
  try {
    startCache(restarted, path);
    assert.deepEqual(names(path), ["unrelated.txt"]);
    assert.equal(restarted.slot, undefined);
    assert.equal(fetch.mock.callCount(), 0);
  } finally { disposeCache(restarted); }
});

test("disk removal happens at the final 1ms deadline without a tool call", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let wall = 1000;
  let mono = 0;
  t.mock.method(Date, "now", () => wall);
  t.mock.method(process.hrtime, "bigint", () => BigInt(mono) * 1_000_000n);
  const timer = t.mock.method(globalThis, "setTimeout");
  const path = directory(t);
  const state = createCache();
  try {
    startCache(state, path);
    parseOrReuse(state, url, html);
    const files = names(path);
    wall += lifetime - 1;
    mono = lifetime - 1;
    t.mock.timers.tick(60_000);
    assert.deepEqual(names(path), files);
    assert.equal(timer.mock.calls.at(-1)!.arguments[1], 1);
    wall++;
    mono++;
    t.mock.timers.tick(1);
    assert.deepEqual(names(path), []);
    assert.equal(state.slot, undefined);
    assert.ok(timer.mock.calls.every((call) => Number(call.arguments[1]) <= 60_000));
  } finally { disposeCache(state); }
  assert.equal(state.diskTimer, undefined);
});

test("disk expiry checks independent clocks, sleep and persisted backward wall observations", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let wall = 0;
  let mono = 0;
  t.mock.method(Date, "now", () => wall);
  t.mock.method(process.hrtime, "bigint", () => BigInt(mono) * 1_000_000n);
  for (const scenario of ["sleep", "monotonic", "backward", "backward-restart", "lookup"]) {
    wall = 1000;
    mono = 0;
    const path = directory(t);
    let state = createCache();
    try {
      startCache(state, path);
      const original = parseOrReuse(state, url, html);
      const files = names(path);
      if (scenario.startsWith("backward")) {
        wall += lifetime / 3;
        t.mock.timers.tick(60_000);
        if (scenario === "backward-restart") disposeCache(state);
        wall -= lifetime / 6; // Still after insertion, but before the persisted observation.
      } else if (scenario === "monotonic") mono = lifetime;
      else wall += lifetime;
      if (scenario === "backward-restart") {
        state = createCache();
        startCache(state, path);
      } else if (scenario === "lookup") {
        assert.notEqual(parseOrReuse(state, url, html), original);
        assert.notDeepEqual(names(path), files);
        continue;
      } else {
        assert.deepEqual(names(path), files);
        t.mock.timers.tick(60_000);
      }
      assert.deepEqual(names(path), [], scenario);
      assert.equal(state.slot, undefined);
    } finally { disposeCache(state); }
  }
});

test("concurrent sweeps preserve a valid record observed by a newer instance", (t) => {
  let wall = 1000;
  t.mock.method(Date, "now", () => wall);
  const path = directory(t);
  const seed = createCache();
  startCache(seed, path);
  parseOrReuse(seed, url, html);
  disposeCache(seed);
  const files = names(path);

  const readdir = fs.readdirSync;
  let interleave = true;
  t.mock.method(fs, "readdirSync", ((target: fs.PathLike) => {
    if (interleave) {
      interleave = false;
      wall++;
      const newer = createCache();
      startCache(newer, path); // Advances the persisted wall observation mid-sweep.
      disposeCache(newer);
    }
    return readdir(target);
  }) as typeof fs.readdirSync);
  const lagging = createCache();
  try {
    startCache(lagging, path);
    assert.deepEqual(names(path), files);
  } finally { disposeCache(lagging); }
});

test("another instance's replacement survives an old deadline and old instance disposal", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let wall = 1000;
  t.mock.method(Date, "now", () => wall);
  t.mock.method(process.hrtime, "bigint", () => 0n);
  const path = directory(t);
  const old = createCache();
  const newer = createCache();
  try {
    startCache(old, path);
    parseOrReuse(old, url, html);
    wall += lifetime - 1;
    t.mock.timers.tick(60_000);
    startCache(newer, path);
    const changed = html.replace("waits", "succeeds");
    parseOrReuse(newer, url, changed);
    const files = names(path);
    assert.equal(files.length, 1);
    wall++;
    t.mock.timers.tick(1);
    disposeCache(old);
    assert.deepEqual(names(path), files);
    assert.equal(fs.readFileSync(join(path, files[0]!), "utf8"), changed);
  } finally { disposeCache(old); disposeCache(newer); }
});

test("interleaved publishers cannot delete each other's replacement and leave no persistent copy", (t) => {
  let wall = 1000;
  t.mock.method(Date, "now", () => wall);
  const path = directory(t);
  const first = createCache();
  const second = createCache();
  startCache(first, path);
  startCache(second, path);
  const rename = fs.renameSync;
  let interleaved = false;
  const changed = html.replace("waits", "succeeds");
  t.mock.method(fs, "renameSync", (from: fs.PathLike, to: fs.PathLike) => {
    rename(from, to);
    if (!interleaved) {
      interleaved = true;
      wall++;
      // Another process can publish after rename but before the first writer's sweep.
      parseOrReuse(second, url, changed);
    }
  });
  try {
    parseOrReuse(first, url, html);
    const files = names(path);
    assert.equal(files.length, 1);
    assert.equal(fs.readFileSync(join(path, files[0]!), "utf8"), changed);
  } finally { disposeCache(first); disposeCache(second); }
});

test("tampered documents, oversize files and symlinks cannot replace current online evidence", (t) => {
  const path = directory(t);
  const seed = createCache();
  startCache(seed, path);
  parseOrReuse(seed, url, html);
  disposeCache(seed);
  for (const scenario of ["tampered", "oversize", "symlink"]) {
    const file = join(path, names(path)[0]!);
    const outside = join(path, "unrelated.txt");
    fs.writeFileSync(outside, "outside data");
    if (scenario === "symlink") { fs.unlinkSync(file); fs.symlinkSync(outside, file); }
    else fs.writeFileSync(file, scenario === "tampered" ? html.replace("waits", "SECRET") : "x".repeat(2 * 1024 * 1024 + 1));
    const state = createCache();
    try {
      startCache(state, path);
      const result = selectEvidence(parseOrReuse(state, url, html), "startup probe");
      assert.equal(result.status, "evidence");
      assert.doesNotMatch(JSON.stringify(result), /SECRET/);
      assert.equal(fs.readFileSync(outside, "utf8"), "outside data");
    } finally { disposeCache(state); fs.unlinkSync(outside); }
  }
});

test("records removed by another process during stat, touch or open are safely replaced", (t) => {
  for (const operation of ["lstatSync", "utimesSync", "openSync"] as const) {
    const path = directory(t);
    const seed = createCache();
    startCache(seed, path);
    parseOrReuse(seed, url, html);
    disposeCache(seed);
    const file = join(path, names(path)[0]!);
    const original = fs[operation];
    let removed = false;
    const spy = t.mock.method(fs, operation, ((...args: unknown[]) => {
      if (args[0] === file && !removed) { fs.unlinkSync(file); removed = true; }
      return Reflect.apply(original, fs, args);
    }) as typeof original);
    const state = createCache();
    try {
      startCache(state, path);
      assert.equal(selectEvidence(parseOrReuse(state, url, html), "startup probe").status, "evidence");
      assert.equal(removed, true);
      assert.equal(names(path).length, 1);
      assert.equal(fs.readFileSync(join(path, names(path)[0]!), "utf8"), html);
    } finally { spy.mock.restore(); disposeCache(state); }
  }
});

test("filesystem failures are sanitized and failed automatic deletion retries without lookup", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let wall = 1000;
  t.mock.method(Date, "now", () => wall);
  const path = directory(t);
  const state = createCache();
  try {
    startCache(state, path);
    const write = t.mock.method(fs, "writeFileSync", () => { throw new Error("SECRET cache /local/path"); });
    assert.throws(() => parseOrReuse(state, url, html), { message: "Documentation retrieval failed." });
    assert.equal(state.slot, undefined);
    write.mock.restore();
    parseOrReuse(state, url, html);
    wall += lifetime;
    const unlink = t.mock.method(fs, "unlinkSync", () => { throw new Error("SECRET cache /local/path"); });
    assert.doesNotThrow(() => t.mock.timers.tick(60_000));
    assert.equal(state.slot, undefined);
    assert.equal(names(path).length, 1); // Cannot promise removal while the filesystem refuses it.
    assert.throws(() => parseOrReuse(state, url, html), { message: "Documentation retrieval failed." });
    unlink.mock.restore();
    t.mock.timers.tick(60_000);
    assert.deepEqual(names(path), []);
  } finally { disposeCache(state); }
});
