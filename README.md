<p align="center">
  <img alt="Kubernetes Knowledge icon" src="https://raw.githubusercontent.com/senad-d/pi-k8s-knowledge/main/assets/icon.svg" width="128">
</p>

<p align="center">
  <a href="https://pi.dev"><img alt="pi package" src="https://img.shields.io/badge/pi-package-6f42c1?style=flat-square" /></a>
  <a href="https://www.npmjs.com/package/@senad-d/pi-k8s-knowledge"><img alt="npm" src="https://img.shields.io/npm/v/%40senad-d%2Fpi-k8s-knowledge?style=flat-square" /></a>
  <a href="https://github.com/senad-d/pi-k8s-knowledge/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/senad-d/pi-k8s-knowledge/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" /></a>
</p>

<p align="center">
  Kubernetes documentation evidence for <a href="https://pi.dev">pi</a>.
  <br />Ask a question and retrieve relevant excerpts with citations from official English Kubernetes documentation — without cluster access or kubeconfig reads.
</p>

---

Kubernetes Knowledge is a native Pi **extension** for documentation retrieval.
Ask a Kubernetes question and Pi can discover relevant official pages, retrieve
bounded article excerpts, and use their source links in its answer. You do not
need to supply a documentation URL. The extension returns evidence, not generated
recommendations; Pi draws the conclusions.

- **Question-first lookup:** discovers candidate pages from the official documentation sidebar catalog.
- **Official sources only:** confines retrieval and redirects to English `https://kubernetes.io/docs` pages.
- **Literal evidence:** preserves source wording and returns page or section citations with explicit truncation indicators.
- **Bounded retrieval:** limits candidate pages, redirects, time, document size, and output size; no broad internet search.
- **Shared documentation storage:** retains retrieved HTML across projects and Pi restarts, with a fixed 30-day expiry and mandatory online validation on every lookup.
- **No cluster access:** does not read kubeconfig or require Kubernetes credentials or extension-specific configuration.

> **Security:** Pi packages run with your full system permissions. This extension
> fetches official documentation and writes retained HTML under
> `~/.pi/.k8s-knowledge/`. Review [Security and Privacy](#security-and-privacy)
> and the source before installation. Project trust is not a sandbox.

## Table of Contents

- [Implementation Status](#implementation-status)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Commands](#commands)
- [Tools](#tools)
- [Architecture](#architecture)
- [Retrieval Workflow](#retrieval-workflow)
- [Requirements and Compatibility](#requirements-and-compatibility)
- [Security and Privacy](#security-and-privacy)
- [Examples](#examples)
- [Development](#development)
- [Publishing](#publishing)
- [License](#license)

---

## Implementation Status

This checkout implements:

- One model-callable tool, `k8s_knowledge`, and one status command, `/k8s-knowledge`.
- Question-only discovery, strict source validation, bounded retrieval, deterministic excerpt selection, and citations.
- Global documentation retention with restart, concurrency, automatic-expiry, and shutdown checks.
- TypeScript validation, native Node tests, exact tarball-content checks, and an opt-in production package install/Pi-loading check.

The package is prepared for public npm distribution as
`@senad-d/pi-k8s-knowledge`. Publication and package-name availability have not
been verified; registry installation commands below apply after release.
Badges depend on the corresponding public repository/package being available.
Provider-mediated smoke remains waived and **unverified, not passed**.

## Quick Start

### 1) Install the extension (after release)

```sh
pi install npm:@senad-d/pi-k8s-knowledge
```

### 2) Start or restart Pi

```sh
pi
```

Inside Pi, confirm loading:

```text
/k8s-knowledge
```

### 3) Ask a Kubernetes question

```text
When should I use a Kubernetes startup probe? Use official documentation and cite the source.
```

Pi can call `k8s_knowledge` with the question alone. The status command does not
perform retrieval or start a question-answering workflow.

### Run from a source checkout

```sh
git clone https://github.com/senad-d/pi-k8s-knowledge.git
cd pi-k8s-knowledge
npm ci --ignore-scripts
npm run validate
npm run dev
```

## Installation

| Scope | Command | Notes |
| --- | --- | --- |
| Global | `pi install npm:@senad-d/pi-k8s-knowledge` | Records the package in user settings. |
| Project-local | `pi install -l npm:@senad-d/pi-k8s-knowledge` | Records the package in project `.pi/settings.json`; trust the project when prompted. |
| One run | `pi -e npm:@senad-d/pi-k8s-knowledge` | Try without persisting a package entry. |
| Git | `pi install git:github.com/senad-d/pi-k8s-knowledge` | Requires an accessible repository; append `@tag` or `@commit` to pin a revision. |
| Local checkout | `pi install -l .` | Run inside this checkout; local paths are recorded, not copied. |
| Development | `npm run dev` | Explicitly loads `src/index.ts` from this checkout. |

Restart Pi after installation. Use either an installed package or the explicit
local development entry point, not both. Keep local checkout paths in place;
use `/reload` for installed local resources after edits, or restart an explicitly
loaded development session.

```sh
pi update npm:@senad-d/pi-k8s-knowledge
pi remove npm:@senad-d/pi-k8s-knowledge
```

Add `-l` to remove a project-local installation. For an installed local checkout,
run `pi remove -l .` from that checkout before deleting it.

## Commands

| Command | Description |
| --- | --- |
| `/k8s-knowledge` | Report extension status in interactive Pi; performs no retrieval. |

## Tools

Registered for the model to call directly.

| Tool | Purpose |
| --- | --- |
| `k8s_knowledge` | Retrieve relevant official English Kubernetes documentation excerpts and citations for a question. Supports latest stable documentation only. |

### Arguments

| Argument | Required | Behavior |
| --- | --- | --- |
| `question` | Yes | Nonempty question, up to 4,096 characters. |
| `version` | No | Omit or use `latest`. Put explicit version requests here; all other selectors, including older releases, are unsupported. Maximum 32 characters. |
| `url` | No | Narrow retrieval to one known official documentation page, up to 2,048 characters. A fragment does not restrict retrieval to that section. |

### Results and limits

The tool returns JSON text in Pi's model-visible result:

- `evidence`: `sourceUrl`, `excerpts` (`text`, `sectionTitle`, `sectionUrl`, `partial`), and `omitted`.
- `no_evidence`: `sourceUrl` (the documentation scope for discovery or the narrowed page) and `"No relevant evidence found."` This does not establish that Kubernetes lacks the capability.
- `unsupported_version`: an explicit latest-only capability message.

Invalid input, unsupported sources/documents, refused redirects, HTTP/network
failures, timeout, excessive size, and cancellation are errors, not no-evidence
results. Offline operation is not supported.

| Bound | Limit |
| --- | --- |
| Candidate articles | At most five after catalog discovery |
| Whole call | 30 seconds, six HTML documents, 24 GETs including redirects; no retries |
| Each page | 15 seconds including redirects, three in-scope redirects, 2 MiB decoded UTF-8 HTML |
| Returned passages | At most five, each at most 1,200 UTF-8 bytes and 80 lines |
| JSON output | At most 16 KiB and 1,000 lines |

`partial: true` marks a cropped contiguous passage. `omitted` counts qualifying
passages not returned. Neither implies complete coverage. Citations identify the
final retrieved page; without a usable unique heading ID, citations are explicitly
page-level. Use source/section links for full documentation.

## Architecture

```text
Kubernetes question
  └── Pi agent
        └── k8s_knowledge
              ├── Official docs catalog → ranked candidate pages
              ├── Validated, bounded HTTPS retrieval
              ├── Article parsing and lexical evidence selection
              └── Literal excerpts + source/section citations
                    └── Pi interprets the evidence for its answer

Retrieved HTML ↔ ~/.pi/.k8s-knowledge/ (shared, fixed 30-day retention)
```

Pi loads TypeScript directly; no build step is required. `src/index.ts` registers
the tool, command, and lifecycle handlers. Pi and TypeBox are host peers with
development dependencies; parse5 is the runtime HTML parser. Registration starts
no resources. Session startup initializes and sweeps storage without networking;
shutdown clears timers and aborts outstanding requests.

## Retrieval Workflow

1. **Validate** the question, optional version, and optional source URL.
2. **Discover** candidate pages from the published sidebar at `/docs/`, unless a URL narrows the request.
3. **Rank** actual link titles and paths by question-term matches, with URL order breaking ties.
4. **Retrieve** at most five candidate articles until one yields relevant excerpts. Every discovered target and redirect must pass the same authorization and resource bounds.
5. **Extract** explicit English article content from the supported site layout, not navigation or arbitrary whole-page text.
6. **Return** bounded literal passages and citations, or an explicit no-evidence result.

The extension does not guess topic URLs or follow article assets, canonical links,
or further article links. Title/path discovery can miss body-only terms,
inflections, and synonyms; it is not comprehensive full-text search.

Excerpt selection is deterministic lexical matching, including camelCase
splitting, not semantic search. Incidental word matches can rank highly.
Unchanged catalog/page content and the same question produce the same excerpt
order; updated pages may change results, with no historical replay.

HTML entities are decoded once, prose HTML whitespace is collapsed, and
preformatted code indentation/newlines are retained. Quotes remain untrusted
source data, never instructions. The extension generates no summaries or
recommendations.

## Requirements and Compatibility

- **Node.js ≥22.19.0** and Pi.
- **Pi 0.85.1** is the verified host. Wildcard host peers follow Pi packaging guidance, not a claim that every Pi version works.
- **Network access** to official English `kubernetes.io/docs`; every lookup requires successful online retrieval.
- **Writable home storage** for `~/.pi/.k8s-knowledge/`.
- Other host versions and operating systems require separate verification. The CI workflow targets Linux with Node 24; configured jobs alone are not proof of compatibility.

No cluster connection, Kubernetes credentials, external search service, or
extension-specific configuration is required.

## Security and Privacy

For vulnerability reporting and the support policy, see [SECURITY.md](SECURITY.md).
Do not disclose vulnerability details in public issues.

Pi extensions inherit the full permissions of the Pi process. Review the source
before loading; project trust is not a sandbox.

- Retrieval sends HTTPS GETs only to authorized official documentation pages. Questions are matched locally, not sent as search queries.
- Retrieved HTML is stored under `~/.pi/.k8s-knowledge/`, shared across projects and Pi sessions. The extension does not store questions or transcripts there.
- Pi and the configured model provider handle tool arguments/results under their own policies; this extension does not provide host-wide transcript redaction.
- Every lookup requires a successful online fetch. Persisted HTML is reusable only when byte-for-byte equal to that fetch; failures never fall back to stored evidence.
- Retention expires 30 days from original insertion, not last access or restart. Expired records are swept during active operation or on next startup.
- No daemon runs while Pi is closed. Suspension, a blocked event loop, or filesystem failures can delay physical deletion; expired records are not usable. This is not secure erasure or a guarantee about backups.

Storage lifecycle, filesystem failure handling, clock limitations, and test
isolation are detailed in the source checkout's [testing documentation](docs/testing.md).

## Examples

Ask Pi:

```text
When should I use a startup probe?
What does restartPolicy control? Cite official Kubernetes documentation.
```

Minimal tool arguments:

```json
{
  "question": "When should I use a startup probe?"
}
```

To narrow retrieval, provide an authorized official documentation URL in `url`.
Older-release requests are unsupported; do not treat latest documentation as
version-specific evidence for an older cluster.

## Development

See [CONTRIBUTING.md](https://github.com/senad-d/pi-k8s-knowledge/blob/main/CONTRIBUTING.md)
for reporting bugs and submitting changes, and [CHANGELOG.md](CHANGELOG.md) for
user-visible changes.

```sh
npm ci --ignore-scripts
npm run validate
npm run dev
```

Individual checks:

```sh
npm run lint            # TypeScript + ESLint (zero warnings)
npm run lint:eslint     # ESLint recommended JavaScript/TypeScript rules
npm run typecheck       # strict no-emit TypeScript
npm test                # native node:test/strict-assert through tsx
npm run test:coverage   # c8: >=81% per source file, plus Sonar LCOV
npm run check:pack      # exact tarball contents and manifest
npm run pack:dry-run    # inspect npm's proposed artifact
```

Coverage includes every `src/**/*.ts` file, including unexecuted files, and
requires at least 81% lines, statements, functions, and branches **per file**.
`npm run validate` and pre-publication checks enforce this threshold.
Reports are written to `coverage/lcov.info` for Sonar and `coverage/lcov-report/`
for local HTML review. Sonar's server-side quality gate is configured separately;
this local threshold does not change it.

Ordinary tests use synthetic HTML, disposable directories, fake homes, and no
network. They cover registered question-only execution, cross-project sharing,
restart, expiry, redirects, output bounds, and exclusion of synthetic private
state from the tarball. See [docs/testing.md](docs/testing.md) for exact scopes.

Opt into production installation and Pi loading (downloads public npm dependencies):

```sh
RUN_PACKAGE_INSTALL=1 npm run check:pack
```

This isolates HOME, USERPROFILE, Pi/npm configuration, and credentials. It uses
synthetic Kubernetes responses and makes no provider call.

Live discovery and direct-page parser checks are separate:

```sh
RUN_K8S_DISCOVERY_LIVE=1 node --import tsx --test --test-name-pattern='question-only live discovery' test/index.test.ts
RUN_K8S_LIVE=1 node --import tsx --test test/index.test.ts
```

The direct-page checks cover two known official pages; they do not prove
question-driven discovery. Live-site and provider checks are not implied by
passing synthetic tests.

Source layout:

- `src/index.ts` — Pi tool, status command, and lifecycle.
- `src/retrieval.ts` — strict input/source policy and bounded validated redirects/GET.
- `src/evidence.ts` — catalog ranking, article parsing, evidence, and internal state.
- `test/*.test.ts` — native Node tests.
- `assets/icon.svg` — editable application icon.
- `assets/preview.png` — gallery image referenced by `pi.image`.
- `.github/workflows/ci.yml` — ordinary validation.
- `.github/workflows/publish.yml` — manual npm publication and release tagging.
- `.github/workflows/sonar.yml` — coverage generation and Sonar scan (requires Sonar configuration/token).

### Local package artifact

From this checkout:

```sh
npm pack --ignore-scripts
npm install --prefix ./.pi/package-preview --omit=dev --legacy-peer-deps --ignore-scripts ./senad-d-pi-k8s-knowledge-0.1.0.tgz
pi install -l ./.pi/package-preview/node_modules/@senad-d/pi-k8s-knowledge
```

Substitute the actual tarball version when it changes. Restart Pi and trust the
project. Use this instead of checkout installation or `npm run dev`, not alongside
them. Before deleting the preview directory:

```sh
pi remove -l ./.pi/package-preview/node_modules/@senad-d/pi-k8s-knowledge
```

Pi supplies host peers; `--legacy-peer-deps` avoids installing a second host.
Do not pass a `.tgz` directly as a Pi extension path. The artifact contains only
`package.json`, this README, `LICENSE`, `SECURITY.md`, `CHANGELOG.md`, and the three runtime TypeScript files.
Tests, docs, icon assets, lockfile, and private state stay in the checkout;
gallery images are hosted through GitHub. Development commands require the checkout.

## Publishing

The manifest targets public npm publication as `@senad-d/pi-k8s-knowledge`.
Before release, confirm package-name ownership and version availability, review
the artifact, and obtain publication authorization. See the source checkout's
[release checklist and historical audit](docs/publishing.md).

After those gates, from a clean source checkout:

```sh
npm run validate
RUN_PACKAGE_INSTALL=1 npm run check:pack
npm run pack:dry-run
npm publish
```

`prepublishOnly` runs ordinary validation before publication; do not bypass it
with `--ignore-scripts`. Use your own npm authentication. Publish the reviewed
version, verify installation in a fresh Pi session, and push the release commit
and tag. Alternatively, `.github/workflows/publish.yml` provides manual-dispatch
publication with provenance and release tagging from the default branch. It
requires npm trusted-publisher and GitHub `npm` environment setup; do not run
both publication paths for the same version.

## License

MIT — Copyright (c) 2026 Senad Dizdarević. See [LICENSE](LICENSE).
