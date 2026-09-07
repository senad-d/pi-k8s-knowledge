# Check registry

Native `node:test` and `node:assert/strict`, run through tsx. Fixtures are small
inline synthetic HTML strings, not official Kubernetes quotations. Network and
clocks are mocked at their boundaries; mocks are restored and instances disposed.
The authoritative interface is now question-first: a URL is not required from the
user, and discovery remains bounded to official English `kubernetes.io/docs`.

| Exact command | Proves | Scope |
| --- | --- | --- |
| `npm run check` | Strict no-emit TypeScript, ESLint, ordinary tests and per-file coverage gate; live checks explicitly skipped | Suite |
| `npm run test:coverage` | c8 includes all `src/**/*.ts`, requires >=81% lines/statements/functions/branches per file, writes `coverage/lcov.info` and HTML under `coverage/lcov-report/` | Coverage gate |
| `npm run typecheck` | Source/tests conform to installed Pi and Node types | Suite |
| `node --import tsx --test test/package.test.ts` | Real npm tarball and archive exact file allowlist, byte equality, Pi entry point, runtime dependencies/peers, minimum engine, public registry/access and pre-publish check, no bundled host/dependencies, and exclusion of synthetic credentials/private state/caches/test residue even inside src | Packaging regression (install skipped) |
| `RUN_PACKAGE_INSTALL=1 node --import tsx --test test/package.test.ts` | Packaging regression plus fresh production tarball install without dev/host peers, real Pi project-local install/settings discovery and jiti loading, question-only execution with synthetic HTML, global fake-home cache and shutdown | Opt-in artifact integration (public npm dependency downloads; not provider/site certification) |
| `node --import tsx --test test/retrieval.test.ts` | Strict raw input/URL/version policy, validated redirect chains including three-hop success/fourth-hop refusal and final identity, bounded streams/deadline/cancellation and sanitized failures | Focused suite |
| `node --import tsx --test test/evidence.test.ts` | Literal article-only extraction, real citations, deterministic catalog/evidence ranking and structure validation, no evidence/output limits; single-slot reuse, independent clocks, automatic removal without lookup and disposal | Focused suite |
| `node --import tsx --test test/index.test.ts` | Actual registered question-only preparation/schema/execute, bounded multi-page discovery and source exclusions, total deadline, global cross-project restart/concurrency/expiry, no evidence/errors, cancellation/shutdown; optional direct-page compatibility | Integration suite (live skipped) |
| `node --import tsx --test --test-name-pattern='global' test/index.test.ts` | Home-relative shared path for startup and execute across different projects, online-only reuse without renewed insertion, automatic/startup expiry, unrelated home and legacy project files untouched | Focused integration regression |
| `node --import tsx --test --test-name-pattern='registered contract accepts a question without a user-supplied URL' test/index.test.ts` | Registered schema/argument preparation accept the question-first contract and metadata concisely explains when to use it without requiring a URL | Promoted defect repro |
| `node --import tsx --test --test-name-pattern='question-only' test/index.test.ts` | Question-only registered execution including discovery, first qualifying page, bounds, online-only restart/concurrency and cancellation/deadline behavior | Focused integration (live skipped) |
| `node --import tsx --test test/persistence.test.ts` | Real filesystem and fresh-process persistence, discovered-page identity, unchanged insertion dates, automatic disk expiry without lookup, independent clocks/resume, interrupted writes, replacement races, tampering/symlinks and sanitized filesystem failure/retry | Persistence suite |
| `RUN_K8S_DISCOVERY_LIVE=1 node --import tsx --test --test-name-pattern='question-only live discovery' test/index.test.ts` | A question-only registered-tool call discovers relevant official English evidence; observes scoped bounded requests and checks literal excerpts/citations against fetched HTML | Opt-in end-to-end defect repro |
| `RUN_K8S_LIVE=1 node --import tsx --test test/index.test.ts` | Current English article parsing, nonempty operational/development evidence, unique real heading anchors, public shapes and bounds for two known official pages | Opt-in parser compatibility smoke plus integration suite |
| `npm run dev` | Explicit local Pi loading; run `/k8s-knowledge`, then ask a configured provider to call `k8s_knowledge` with a question only and inspect the actual tool result | Manual host/provider smoke |
| `HOME="$PWD/.pi/smoke-home" USERPROFILE="$PWD/.pi/smoke-home" PI_CODING_AGENT_DIR="$PWD/.pi/smoke-agent" PI_OFFLINE=1 PI_TELEMETRY=0 JITI_FS_CACHE=0 npm run dev -- --no-session --no-extensions --no-skills --no-prompt-templates --no-themes --no-context-files --no-approve` | Isolated explicit-load selection and fake home cache; enter `/k8s-knowledge` then `/quit`, without altering existing user settings/trust | Manual loading smoke (not provider certification) |
| `npm exec --cache "$PWD/.pi/npm-cache" --yes --package=node@22.19.0 -- node --import tsx --test test/*.test.ts` | Ordinary checks on the declared minimum Node runtime, including native timer mocks | Opt-in runtime compatibility suite (downloads Node) |

The GitHub Actions workflow `.github/workflows/ci.yml` runs validation including
the coverage gate on Linux with Node 24. `.github/workflows/sonar.yml` runs
`npm run test:coverage` before uploading the LCOV report to Sonar.
The Sonar server's quality-gate conditions must be configured separately; local
coverage enforcement does not change the remote quality gate.
`npm publish` also runs ordinary checks through `prepublishOnly`; it does not
run the network-dependent artifact integration check automatically.

The package checks require npm and tar. Their child processes allowlist the
environment, use disposable HOME/USERPROFILE, Pi configuration, npm user/global
configuration, npm cache and temporary directories under `.pi/`, disable install
scripts and Pi startup networking, and never read real credentials or private
state. The production install uses `--omit=dev --legacy-peer-deps` to exercise
Pi's host-provided peers, and asserts the installed dependency tree cannot be
silently supplied by development dependencies. Only synthetic canaries are
staged; both real tarball membership and bytes are checked. All created artifacts
are removed after the test. The check does not publish or authenticate.

Single-test selection: add `--test-name-pattern='name'` before the test file to
any `node --import tsx --test` command above. Coverage applies to the complete
ordinary suite, not a single-test selection. Reports include all source files,
not test/dependency code, and are ignored by Git and excluded from npm artifacts.
The direct-page retrieval and known-page live checks cover reusable target-validation
and parser seams only; they do not prove question-driven discovery. The two promoted
question-only checks are the corrected interface and end-to-end gates.

The opt-in live tests initialize the installed Pi HTTP dispatcher exactly as its
CLI does before spying on fetch. This is test-host setup, not extension behavior:
Node 26's native fetch can lose headers/decompression when mixed with Pi's npm
Undici dispatcher. Ordinary synthetic tests need no network setup.

Live site/provider availability is not required for the ordinary suite. A blocked
or failing live/provider smoke is not a pass, even when synthetic checks pass.
Pi owns original tool arguments in its history and its own errors; these checks
cover the extension's surfaces, not host-wide transcript redaction.

The user waived the credential-dependent provider-mediated smoke gate for this
delivery. It remains **unverified, not passed**. Do not inspect or modify user
authentication to run it. Independent review and testing are still separate
required workflow steps; implementation checks are not independent review.

## Maintainer retention contract

The user explicitly requires documentation to survive Pi restarts in the global
shared directory `~/.pi/.k8s-knowledge/`. The path is resolved with Node's
`homedir()`, independent of project cwd, Pi's `CONFIG_DIR_NAME` and
`PI_CODING_AGENT_DIR`. This explicit location supersedes the former project-local
placement. Bounded UTF-8 documents remain private (directory 0700, files 0600).
The factory remains side-effect-free; `session_start` initializes and sweeps
storage without networking. Tool execution also initializes it if the host invokes
a tool without the start event. No settings or authentication files are read.
Tests use disposable directories under this repository's `.pi/`; registered-tool
checks set `HOME`/`USERPROFILE` to a fresh fake home per test and restore them
afterward. Automated checks never use the user's real home cache; cleanup removes
only the created test directories. The isolated manual loading command also sets
a fake home; `PI_CODING_AGENT_DIR` alone no longer isolates documentation storage.

Upgraded instances do not read, migrate or sweep legacy project-local caches
(normally `<project>/.pi/k8s-knowledge/`). Existing residue is left untouched and
can remain beyond its former deadline when no older runtime is cleaning it.
After reloading old sessions, maintainers may manually remove verified legacy
cache records if desired; do not delete the project's `.pi/` or unrelated files.
Automatic sweeps inspect only recognized record names inside the new dedicated
directory, never the home directory or sibling Pi contents.

A record's immutable name includes its original insertion date, source/body
hashes and a unique suffix. Publication uses a same-directory temporary file and
atomic rename. Only successfully parsed documents enter storage. Interrupted
`.tmp` writes are never reused and are swept by the same absolute deadline.
Different pages have separate records; publishing changed content removes older
bodies for that source. Concurrent writers may retain duplicate copies until
their individual fixed deadlines, and immutable names keep old cleanup from
unlinking a replacement. All projects/sessions for the same home use this store;
they reuse the existing exclusive temporary writes, atomic publication and
missing-file-tolerant reads/deletes rather than a process-local lock (which would
not coordinate independent Pi processes). The memory working set remains one
parsed page per instance.

Every call requires successful bounded online retrieval of its discovery catalog
and each searched candidate (or its optional explicitly narrowed page). Sources
are keyed by final validated URL after redirects. A persisted document is reusable
only when it is byte-for-byte equal to that call's returned HTML; it is parsed
using the current parser. Neither
corrupted local contents nor a failed GET can supply evidence. Questions, results
and agent transcripts are not stored here. Filesystem errors become only
`Documentation retrieval failed.` on tool execution, never internal metadata.
No offline fallback or agent-facing storage controls/notices are introduced.

Retention is absolute: 30 days from original insertion, not last access or
restart. Sweeps run at startup and at most every 60 seconds while scheduled,
shortened to the nearest known deadline, and run before reuse. Active runtimes
also enforce monotonic elapsed time independently of wall time. Observed wall
reversals remove documents; file modification times persist wall observations
across restarts without renewing the insertion date. Shutdown releases memory
and timers but preserves still-valid disk records.

**Physical limits:** no JavaScript can delete files while all Pi runtimes are
stopped, the OS is suspended, or the event loop is blocked. Overdue files can
therefore remain physically present until the next automatic startup/resume
sweep; they are never usable after expiry. No daemon or OS job is installed.
Downtime age relies on the system wall clock; arbitrary unobservable clock
changes while all processes are stopped cannot be reconstructed. An inaccessible
or read-only filesystem can prevent deletion: automatic cleanup retries every
60 seconds, clears the memory working set, and tool operations fail closed until
storage is usable again. These are explicit lifecycle/filesystem limitations,
not a promise of deletion while powered off or secure erasure of RAM/backups.

The old nonpersistent/supplied-page-only plan has been replaced by the current
[implementation record](plans/kubernetes-knowledge.md), including the observed
official sidebar catalog and bounded discovery strategy. Automatic discovery
changes how URLs are selected, not their persistent-retention or no-disclosure
policy.
