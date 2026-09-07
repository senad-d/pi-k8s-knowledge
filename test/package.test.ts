import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import fs from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const shipped = ["CHANGELOG.md", "LICENSE", "README.md", "SECURITY.md", "package.json", "src/evidence.ts", "src/index.ts", "src/retrieval.ts"];

function workspace(t: TestContext) {
  fs.mkdirSync(".pi", { recursive: true });
  const root = fs.mkdtempSync(join(process.cwd(), ".pi", "k8s-package-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  // Allowlist environment: never inherit provider keys, npm tokens/config or Node preload hooks.
  const env = { PATH: process.env.PATH, HOME: join(root, "home"), USERPROFILE: join(root, "home"),
    TMPDIR: root, TMP: root, TEMP: root, PI_CODING_AGENT_DIR: join(root, "agent"),
    PI_OFFLINE: "1", PI_TELEMETRY: "0", JITI_FS_CACHE: "0",
    npm_config_userconfig: join(root, "user.npmrc"), npm_config_globalconfig: join(root, "global.npmrc"),
    npm_config_cache: join(root, "npm-cache"), npm_config_registry: "https://registry.npmjs.org/",
    npm_config_ignore_scripts: "true", npm_config_audit: "false", npm_config_fund: "false" };
  fs.mkdirSync(env.HOME);
  fs.writeFileSync(env.npm_config_userconfig, "");
  fs.writeFileSync(env.npm_config_globalconfig, "");
  return { root, env };
}

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): string {
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8", timeout: 120_000, maxBuffer: 1024 * 1024 });
  assert.equal(result.status, 0, `${command}: ${result.error ?? ""}\n${result.stderr}\n${result.stdout}`);
  return result.stdout;
}

function pack(source: string, destination: string, env: NodeJS.ProcessEnv): string {
  const [report] = JSON.parse(run("npm", ["pack", source, "--json", "--ignore-scripts", "--offline",
    "--pack-destination", destination], destination, env));
  assert.deepEqual(report.files.map((file: { path: string }) => file.path).sort(), shipped);
  assert.deepEqual(report.bundled, []);
  const tarball = join(destination, report.filename);
  assert.deepEqual(run("tar", ["-tzf", tarball], destination, env).trim().split("\n").sort(),
    shipped.map((file) => `package/${file}`));
  return tarball;
}

test("packed artifact contains only reviewed runtime files, even with private state and residue present", (t) => {
  const { root, env } = workspace(t);
  const artifact = pack(process.cwd(), root, env);
  run("tar", ["-xzf", artifact], root, env);
  for (const file of shipped) assert.deepEqual(fs.readFileSync(join(root, "package", file)), fs.readFileSync(file));
  const staged = join(root, "staged");
  fs.cpSync(join(root, "package"), staged, { recursive: true });
  fs.copyFileSync(".gitignore", join(staged, ".gitignore"));
  // Synthetic canaries only. Never copy real credentials, caches or session files.
  for (const file of [".env", ".npmrc", "auth.json", ".pi/agent/auth.json", ".pi/sessions/session.jsonl",
    ".pi/.k8s-knowledge/page.html", "test/residue.ts", "coverage/result.json", "old.tgz",
    "src/auth.json", "src/.env", "src/.pi/state.json", "src/cache/page.html", "src/residue.test.ts"]) {
    fs.mkdirSync(dirname(join(staged, file)), { recursive: true });
    fs.writeFileSync(join(staged, file), "PACKAGE_TEST_PRIVATE_CANARY");
  }
  pack(staged, root, env);
});

test("packed manifest declares the Pi entry point, runtime dependencies and public release checks", (t) => {
  const { root, env } = workspace(t);
  const artifact = pack(process.cwd(), root, env);
  run("tar", ["-xzf", artifact], root, env);
  const manifest = JSON.parse(fs.readFileSync(join(root, "package", "package.json"), "utf8"));
  assert.equal(manifest.name, "@senad-d/pi-k8s-knowledge");
  assert.equal(manifest.license, "MIT");
  assert.equal(manifest.author, "Senad Dizdarević <112484166+senad-d@users.noreply.github.com>");
  assert.equal(manifest.private, undefined);
  assert.deepEqual(manifest.publishConfig, { access: "public", registry: "https://registry.npmjs.org/" });
  assert.equal(manifest.scripts.prepublishOnly, "npm run validate");
  assert.equal(manifest.scripts.validate, "npm run check");
  assert.deepEqual(manifest.pi, {
    extensions: ["./src/index.ts"],
    image: "https://raw.githubusercontent.com/senad-d/pi-k8s-knowledge/main/assets/preview.png",
  });
  assert.deepEqual(manifest.files, ["src/index.ts", "src/retrieval.ts", "src/evidence.ts", "README.md", "LICENSE", "SECURITY.md", "CHANGELOG.md"]);
  assert.deepEqual(manifest.engines, { node: ">=22.19.0" });
  assert.deepEqual(manifest.dependencies, { parse5: "7.3.0" });
  assert.deepEqual(manifest.peerDependencies,
    { "@earendil-works/pi-coding-agent": "*", typebox: "*" });
  assert.ok(manifest.keywords.includes("pi-package"));
  assert.equal(manifest.bundledDependencies, undefined);
  assert.equal(manifest.bundleDependencies, undefined);
});

const load = `
  import assert from 'node:assert/strict';
  import fs from 'node:fs';
  import { join } from 'node:path';
  import { homedir } from 'node:os';
  import { createRequire } from 'node:module';
  assert.equal(createRequire(join(process.argv[2], 'package.json')).resolve('parse5'),
    join(process.cwd(), 'node_modules', 'parse5', 'dist', 'cjs', 'index.js'));
  const { DefaultResourceLoader } = await import(process.argv[1]);
  assert.equal(homedir(), process.env.HOME);
  const cache = join(homedir(), '.pi', '.k8s-knowledge');
  const requests = [];
  const docs = 'https://kubernetes.io/docs/';
  const page = docs + 'example/';
  // Synthetic documents exercise the installed parser, not the real website or a provider.
  globalThis.fetch = async (url) => {
    requests.push(url);
    assert.ok(url === docs || url === page);
    return new Response('<html lang=en><body>' + (url === docs
      ? '<nav class=td-sidebar-nav><a href="/docs/example/">Startup probe</a></nav>' : '') +
      '<main><div class=td-content><h1>Example</h1><h2 id=startup>Startup probe</h2>' +
      '<p>A startup probe waits.</p></div></main></body></html>', { headers: { 'content-type': 'text/html' } });
  };
  const loader = new DefaultResourceLoader({ cwd: process.cwd(), agentDir: process.env.PI_CODING_AGENT_DIR,
    noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true });
  await loader.reload(); // Discover through the settings written by the real pi install command.
  const { extensions, errors } = loader.getExtensions();
  assert.deepEqual(errors, []);
  assert.equal(extensions.length, 1);
  const extension = extensions[0];
  assert.equal(extension.resolvedPath, join(process.argv[2], 'src', 'index.ts'));
  assert.deepEqual([...extension.tools.keys()], ['k8s_knowledge']);
  assert.deepEqual([...extension.commands.keys()], ['k8s-knowledge']);
  assert.deepEqual(requests, []);
  assert.equal(fs.existsSync(cache), false);
  const context = { cwd: process.cwd(), hasUI: false };
  const tool = extension.tools.get('k8s_knowledge').definition;
  try {
    for (const handler of extension.handlers.get('session_start')) await handler({ type: 'session_start', reason: 'startup' }, context);
    await extension.commands.get('k8s-knowledge').handler('', context);
    assert.deepEqual(requests, []);
    assert.deepEqual(fs.readdirSync(cache), []);
    assert.match(tool.description, /^Use first whenever you need Kubernetes knowledge/);
    assert.ok(tool.description.length <= 320);
    const args = tool.prepareArguments({ question: 'When should I use a startup probe?' });
    assert.deepEqual(args, { question: 'When should I use a startup probe?' });
    const result = await tool.execute('artifact-check', args, undefined, undefined, context);
    assert.deepEqual(result.details, {});
    assert.deepEqual(JSON.parse(result.content[0].text), { status: 'evidence', sourceUrl: page, omitted: 0,
      excerpts: [{ text: 'A startup probe waits.', sectionTitle: 'Startup probe', sectionUrl: page + '#startup', partial: false }] });
    assert.deepEqual(requests, [docs, page]);
    assert.equal(fs.readdirSync(cache).length, 2);
    assert.equal(fs.existsSync(join(process.cwd(), '.pi', 'k8s-knowledge')), false);
  } finally {
    for (const handler of extension.handlers.get('session_shutdown')) await handler({ type: 'session_shutdown', reason: 'quit' }, context);
  }
  await assert.rejects(tool.execute('closed', { question: 'startup probe' }, undefined, undefined, context), { message: 'Cancelled.' });
  console.log('Artifact discovery, question-only execution, global cache and shutdown passed.');
`;

test("production tarball install loads through Pi with host peers and no development dependencies", {
  skip: process.env.RUN_PACKAGE_INSTALL !== "1",
}, (t) => {
  const { root, env } = workspace(t);
  const artifact = pack(process.cwd(), root, env);
  const prefix = join(root, "consumer");
  fs.mkdirSync(prefix);
  fs.writeFileSync(join(prefix, "package.json"), '{"private":true}');
  run("npm", ["install", artifact, "--prefix", prefix, "--omit=dev", "--legacy-peer-deps", "--ignore-scripts",
    "--no-audit", "--no-fund", "--fetch-retries=0", "--fetch-timeout=30000"], root, env);
  const modules = join(prefix, "node_modules");
  assert.deepEqual(fs.readdirSync(modules).sort(), [".package-lock.json", "@senad-d", "entities", "parse5"]);
  assert.deepEqual(fs.readdirSync(join(modules, "@senad-d")), ["pi-k8s-knowledge"]);
  const installed = join(modules, "@senad-d", "pi-k8s-knowledge");
  for (const file of shipped) assert.deepEqual(fs.readFileSync(join(installed, file)), fs.readFileSync(file));
  const host = import.meta.resolve("@earendil-works/pi-coding-agent");
  const cli = fileURLToPath(new URL("./bundle/cli.js", host));
  run(process.execPath, [cli, "install", "-l", installed, "--approve"], prefix, env);
  const settingsDirectory = join(prefix, ".pi");
  const settings = JSON.parse(fs.readFileSync(join(settingsDirectory, "settings.json"), "utf8"));
  assert.deepEqual(settings.packages.map((source: string) => resolve(settingsDirectory, source)), [installed]);
  t.diagnostic(run(process.execPath, ["--input-type=module", "-e", load, host, installed], prefix, env).trim());
});
