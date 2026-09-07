# Public release checklist

The package now targets public npm distribution: `private` is removed,
`publishConfig` selects public access on npmjs.org, and `prepublishOnly` runs
`npm run validate` (typecheck, tests and artifact checks). This prepares
publication; it does not authorize or perform it. The package is
`@senad-d/pi-k8s-knowledge`, with MIT licensing and the author's supplied details.
The Pi manifest, exact runtime-file allowlist and host peers remain unchanged.

## Before the first release

1. MIT metadata and `LICENSE` are included in the reviewed artifact, following
   the owner's package example. Review dependency licensing too.
2. Confirm ownership/availability of `@senad-d/pi-k8s-knowledge` on npm and the intended
   release version. If choosing a scope or different name, update package.json,
   lockfile, README commands and package-test expectations together.
3. The owner confirmed `https://github.com/senad-d/pi-k8s-knowledge`;
   package.json includes its `repository`, `homepage` and `bugs` URLs.
   Verify public accessibility and review tracked files for secrets before pushing.
4. Run the commands below from a source checkout. Review the resulting tarball,
   not just the working tree. Obtain explicit publication authorization.

```sh
npm ci --ignore-scripts
npm run check
RUN_PACKAGE_INSTALL=1 node --import tsx --test test/package.test.ts
npm pack --dry-run --ignore-scripts
```

After those gates and authorization, a maintainer can run `npm publish` using
their own npm authentication. Do not bypass lifecycle checks with
`--ignore-scripts` during publication. Verify the published version in a fresh
Pi installation with `pi install npm:@senad-d/pi-k8s-knowledge@0.1.0` (substitute the
actual release version), then test `/k8s-knowledge` and a question-only lookup.
Record release changes and tag the tested commit. No automated publishing or
credential setup is included.

`.github/workflows/check.yml` runs ordinary checks and the production artifact
install/load check on Linux with Node 22.19.0 and 24. It needs no provider or npm
publication secrets, and does not publish. Its hosted results are not yet
verified. Live-site/provider tests remain separate from synthetic artifact tests.

## Historical local publishing-readiness audit

The audit below describes the earlier private-package snapshot. Its references
to the private guard and local-only status are historical, superseded by the
release preparation above, including the subsequently supplied MIT license and
author details; its old verification results are not new CI results.

Audited against the installed **Pi 0.85.1** documentation on 2026-09-06, not
inferred from third-party extensions. **Ready for local package use; not cleared
for registry publication.** No publication, Git integration, remote issue or
authentication change was performed. The implementation runs and subsequent
independent QA review are recorded separately below.

## Source-cited checklist

| Condition | Classification and finding |
| --- | --- |
| Package discovery | **Required:** explicit `pi.extensions: ["./src/index.ts"]` resolves relative to the package root. Present and artifact-loaded. Conventional directories are an alternative, not additionally required. [P: Creating/Structure][P] |
| Entry point | **Required:** default factory receiving `ExtensionAPI`; TypeScript is loaded by jiti, without a build. Present. `main`, `exports`, `bin`, compiled output and release hooks are not needed for this Pi-only package. [E: Writing an Extension][E] |
| Runtime dependencies | **Required:** parse5 7.3.0 is in `dependencies`; Pi and TypeBox imports are `*` host peers, not bundled. Dev tools remain dev-only. No other Pi package is imported, so the conditional bundled-Pi-package rule does not apply. Production artifact installs only this extension, parse5 and entities. [P: Dependencies][P] |
| Runtime compatibility | Node `>=22.19.0` matches the installed Pi manifest. Checked on macOS arm64 with Node 22.19.0 and 26.0.0 / Pi 0.85.1. Wildcard peers are Pi's packaging convention, not certification of all hosts. No new OS/CPU or provider compatibility claims. [Host manifest][H] |
| Shipped files and privacy | npm `files` is **optional hardening**, but excluding credentials/private state is an explicit assignment requirement. Changed recursive `src` to the three exact runtime files. Real tarballs contain only those files, README and package.json; no tests, lockfile, `.pi`, credentials, caches, dependencies or residue. Synthetic canaries under `src` reproduced a leak with the old rule, including `.env`. [N: files][N] |
| Tool output | **Required:** bounded output; existing truncation uses Pi's `truncateHead`, preserves JSON and reports `partial`/`omitted` with source links for complete documentation. **Documented guidance fixed:** appended existing limits to the tool description (still below 320 characters, still default Kubernetes lookup). No evidence selection changes or full-output cache exposure. [E: Output Truncation][E], [example][T] |
| Lifecycle, errors and UI | **Required applicable API discipline:** factory starts no resources; session start/tool use initializes; idempotent shutdown clears timers/aborts requests; tool errors throw; notifications guard `hasUI`. Already implemented. Internal immutable-file publication is not a user-file read/modify/write operation; adding a process-local mutation queue would not coordinate the shared cross-process cache. [E: Long-lived resources, Custom Tools, Mode Behavior][E] |
| Installation/security guidance | Clarified source checkout versus artifact, global versus project-local settings, local paths are not copied, trust/reload/removal and full-system permissions. Real `pi install` and SDK settings discovery load the installed artifact. [P: Install/Local Paths][P], [security][S], [SDK: ResourceLoader][D] |
| Discovery/gallery | `pi-package` keyword already present (**discoverability recommendation**). Video/image previews are optional. No gallery infrastructure added. [P: Gallery Metadata][P] |
| npm publication | **Required if publishing:** valid name/version, available unique name/version at the chosen registry, publication authority and removal of `private: true`. Existing name/version retained; registry availability/ownership/authentication were not queried. Guard intentionally retained. [N: name/version/private][N], [npm publish][U] |
| License and optional metadata | **Owner decision:** no extension license/permission grant has been supplied. Do not copy Pi's MIT license onto this work or invent `UNLICENSED`, author, repository, homepage or issue URLs. npm recommends license metadata; missing license is not a Pi loader or npm syntactic gate, but permission to distribute must be settled. Repository/author/gallery metadata and provenance automation are not mandatory Pi conditions. [N: license/people/repository][N], [U: provenance][U] |

## Fixes and verification

- `package.json`: exact source-file allowlist; dependencies, engine, package
  identity, private guard and Pi manifest unchanged. No lockfile update is needed
  for a `files`-only edit (the existing lock root still matches dependency fields).
- `src/index.ts`: description-only addition of existing output limits; the
  question-first official-English-docs scope and use-first prefix remain intact.
  Retrieval, evidence selection and global internal `~/.pi/.k8s-knowledge/`
  retention implementation are unchanged.
- `README.md`: usable local artifact install/remove instructions, host-version
  caveat, security guidance and explicit owner publication decisions.
- `test/package.test.ts`, `test/index.test.ts`, `docs/testing.md`: runnable
  artifact and description regressions with registered commands.

Verification on the final implementation:

| Command | Result |
| --- | --- |
| `node --import tsx --test test/package.test.ts` | Packaging regression passed; install deliberately skipped unless opted in. Before the allowlist fix, the staged artifact included five private/residue files under src and failed. |
| `node --import tsx --test --test-name-pattern='registered contract accepts a question without a user-supplied URL' test/index.test.ts` | Passed; new output-limit assertion failed before the description fix. |
| `RUN_PACKAGE_INSTALL=1 node --import tsx --test test/package.test.ts` | Both checks passed: actual npm tarball, production install, exact installed files/dependencies, real Pi install, settings-based jiti discovery, synthetic question-only execution, global fake-home cache and shutdown. Removing parse5 from runtime dependencies temporarily made the install check fail; mutation restored. |
| `npm run check` | Typecheck and 51 ordinary tests passed on Node 26.0.0; three live Kubernetes tests and the opt-in artifact install skipped. Artifact install passed separately. |
| Node 22.19.0 invocation below | 52 tests passed, including production artifact install/load; only three live Kubernetes tests skipped. |
| `git diff --check` | Passed. Existing uncommitted work preserved; Git diff also contains earlier objectives, not just this audit. |

The artifact test uses an allowlisted child environment, disposable HOME and
USERPROFILE **as well as** Pi configuration, npm user/global configuration/cache
and temp directories under the checkout. It never copies actual credentials or
private state. Every generated tarball, canary and install directory is removed.
Exact membership plus reviewed shipped content is not a general-purpose secret
scanner: future edits to the allowed source files still need review.

Minimum-runtime rerun (npm downloads Node; Node's installer lifecycle is needed
for that download, while the artifact test itself disables install scripts):

```sh
set -eu
root=$(mktemp -d "$PWD/.pi/k8s-runtime-check-XXXXXX")
trap 'rm -rf "$root"' EXIT
mkdir "$root/home"
touch "$root/user.npmrc" "$root/global.npmrc"
env -i PATH="$PATH" HOME="$root/home" USERPROFILE="$root/home" TMPDIR="$root" \
  PI_CODING_AGENT_DIR="$root/agent" PI_OFFLINE=1 PI_TELEMETRY=0 JITI_FS_CACHE=0 \
  npm_config_userconfig="$root/user.npmrc" npm_config_globalconfig="$root/global.npmrc" \
  npm_config_registry=https://registry.npmjs.org/ npm_config_audit=false npm_config_fund=false \
  RUN_PACKAGE_INSTALL=1 npm exec --cache "$root/npm-cache" --yes --package=node@22.19.0 \
  -- node --import tsx --test test/*.test.ts
```

## Independent QA review

The installed Pi README, `packages.md` and `extensions.md` were read completely;
relevant full settings, environment, security, quickstart and SDK documents,
extension examples, and npm package/pack/publish documents were cross-checked.
The required-versus-optional classifications and remaining owner decisions above
were confirmed. No production defect was found.

QA added an artifact-manifest regression for the Pi entry point, exact runtime
dependency/peer contract, minimum Node engine, `pi-package` discovery keyword,
no bundled dependencies, exact file allowlist and retained `private: true` guard.
The production artifact check now also exercises Pi's documented project-local
install/settings path before jiti loading and question-only synthetic execution.
Both checks were shown to fail under temporary regressions and then restored.

| Independent command | Result |
| --- | --- |
| `npm run check` | Passed on Node 26.0.0: 52 passed; three live site checks and the opt-in artifact install skipped. |
| `RUN_PACKAGE_INSTALL=1 node --import tsx --test test/package.test.ts` | Passed: 3/3, including real tarball, production dependencies, project-local Pi install/discovery, question-only execution, fake-home global cache and shutdown. |
| Isolated Node 22.19.0 package command shown above, narrowed to `test/package.test.ts` | Passed: 3/3. HOME, USERPROFILE, Pi/npm config, cache and temp paths were disposable; provider credentials were not inspected. |
| `npm pack --json --dry-run --ignore-scripts` and `git diff --check` | Passed; exactly five reviewed files and no bundled dependency were reported. |

Provider-mediated and live-site smoke remain unverified, not passed.

## Remaining owner/workflow gates

1. Choose licensing/distribution permissions; supply only truthful desired
   author/contact/repository metadata. Review dependency licensing for the chosen
   distribution (parse5/entities remain separately installed dependencies).
2. Decide registry, package name/scope ownership, unused release version and
   access. Obtain separate publication authorization before removing `private`;
   no registry login or ownership inspection was attempted.
3. **Provider-mediated smoke remains unverified, not passed.** No credentials
   were inspected to attempt it. Synthetic artifact loading is not provider or
   live-site certification. Git/registry distribution and other OS/host versions
   were not exercised; no remote repository is assumed.

## Authoritative sources read

The installed README was read completely, together with full `packages.md`,
`extensions.md`, relevant cross-references `settings.md`, `environment-variables.md`,
`security.md`, `sdk.md`, `tui.md`, the extension examples README, `with-deps`
manifest/entry, `truncated-tool.ts` and SDK `06-extensions.ts`. npm's installed
`package-json.md`, `npm-pack.md` and `npm-publish.md` supply registry-specific
conditions that Pi's package docs do not define. Links below identify that local
installed documentation snapshot; it is the audit source, not project metadata.

[P]: /opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/packages.md
[E]: /opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md
[H]: /opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/package.json
[S]: /opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/security.md
[D]: /opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/sdk.md
[T]: /opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/truncated-tool.ts
[N]: /opt/homebrew/lib/node_modules/npm/docs/content/configuring-npm/package-json.md
[U]: /opt/homebrew/lib/node_modules/npm/docs/content/commands/npm-publish.md
