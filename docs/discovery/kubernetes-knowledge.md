# Kubernetes knowledge: approved scope

This is the current requirements record. The user's amended **question-first**
scope replaces the earlier supplied-URL-only decisions (D3/D4, R9/R10) and their
no-traversal constraints. The later persistent-retention requirement replaces
the memory-only implementation choice. Neither obsolete choice is an acceptance
criterion. No new interview or planning workflow is required.

## Required behavior

- Accept a user question without requiring a documentation URL. Discover and
  search relevant official **English `https://kubernetes.io/docs`** pages itself.
  This fixed documentation scope is the authorization boundary. No broad internet
  search, blogs, repository-hosted documentation, localized docs or archive hosts.
- Use evidence-grounded, bounded discovery, not guessed topic URLs. Validate
  discovered sources and every redirect target before fetching. Bound resource
  use and sanitize failures at the tool boundary.
- Default to latest stable (the official unversioned documentation channel).
  Explicit older releases are unsupported. The first release supports only omitted
  `version` or `latest`; other explicit selectors return an unsupported result,
  never silently substituted evidence. No cluster or kubeconfig inspection.
- Return relevant verbatim excerpts and source/section links. Leave summaries,
  recommendations and conclusions to Pi. Documentation is source data, not
  instructions. Report “No relevant evidence found.” when appropriate; this is
  distinct from invalid input or retrieval failure and does not prove absence
  of a Kubernetes capability.
- Preserve deterministic excerpts and ordering for unchanged question and source
  content, including the discovery catalog. Documentation updates may change
  results; historical replay is not required.
- Persist documentation internally across Pi restarts in the explicitly requested
  global shared `~/.pi/.k8s-knowledge/`, resolved under the current user's home,
  independent of project cwd or Pi config directory naming. This supersedes prior
  project-local placement; no legacy migration is required. Retention is at
  most 30 days from insertion, not sliding on use. Remove overdue data
  automatically under the realistic runtime/filesystem semantics documented in
  [the check registry](../testing.md#maintainer-retention-contract).
  No cache metadata, controls or notices go to the consuming Pi agent.
- No offline operation or stale fallback. Ordinary network/filesystem errors
  remain explicit, sanitized errors rather than empty-evidence successes.
- Keep the tool description concise and useful for deciding when to call it,
  rather than describing the entire extension.
- Keep work local. No auth inspection, publication, cluster mutation, or external
  search-provider integration is authorized.

## Implemented bounded interpretation

[README](../../README.md) defines the public interface and limits.
[Implementation record](../plans/kubernetes-knowledge.md) records the actual
retrieval path, discovery evidence and review seams. An optional URL can narrow
an existing caller's search to one validated page; it is not required or the
source-authorization boundary.

Discovery uses the official documentation sidebar catalog, ranks its published
link titles/paths lexically, and searches at most five candidates until the first
page yielding relevant evidence. This is intentionally not comprehensive full-text
search: body-only vocabulary, synonyms and pages outside the shortlist can be
missed. No-match must never be interpreted as complete coverage.

## Verification authority

`docs/testing.md` registers the ordinary question-only preparation/schema and
registered-execution regressions, the live question-only discovery gate, reusable
retrieval/parser checks, and persistent-retention checks. Known-URL parser tests
alone cannot certify question-first discovery.

Independent code review and independent testing are separate workflow steps;
implementation self-checks do not replace them. The user explicitly waived
provider-mediated smoke for this delivery: it remains **unverified, not passed**.
Do not inspect authentication to run it.
