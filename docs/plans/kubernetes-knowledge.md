# Kubernetes knowledge implementation record

This record replaces the obsolete v4 supplied-page-only/nonpersistent task plan.
It documents the question-first correction, not a new proposal or planning
workflow. Requirements: [approved scope](../discovery/kubernetes-knowledge.md).
Runnable acceptance commands and retention semantics: [check registry](../testing.md).

## Discovery evidence and choice

A bounded GET inspection on 2026-09-06 established that:

- `https://kubernetes.io/docs/` redirects to `/docs/home/`.
- The returned English HTML has one `main`, an article `div.td-content`, and
  `nav.td-sidebar-nav` containing the published documentation catalog.
- The inspected body was 498,071 bytes, with 855 unique `/docs/` links across
  the page, including links to the probe concepts/task pages and Pod lifecycle.

The implementation starts at the stable official `/docs/` entry point and follows
only validated redirects. It does not hard-code the observed `/docs/home/` redirect
or guess URLs from question terms. It parses the sidebar's actual anchors with
existing parse5. No sitemap outside `/docs`, external search engine, browser,
JavaScript assets, semantic service or added dependency is needed.

## Actual execution path

1. `src/index.ts` registers one `k8s_knowledge` tool and the status command.
   The factory creates only empty state and resolves `~/.pi/.k8s-knowledge/` under
   Node's `homedir()`. `session_start` initializes shared global retention;
   execution also initializes it when startup was omitted. Project cwd and Pi
   config/branding overrides do not select this explicitly requested path.
   Shutdown closes state and aborts outstanding work. Legacy project caches are
   left untouched, without migration or sweeping (see the retention contract).
2. Pure `prepareArguments` validates raw types/keys/lengths before Pi can coerce
   optional values or echo invalid input. Execute revalidates because tool-call
   hooks can mutate prepared arguments. Require `question`, allow `version` and
   optional `url`; reject everything else. Unsupported versions do no networking.
3. Without `url`, fetch the official docs entry point, validate/retain the English
   article, then extract the catalog. Missing, ambiguous, hidden or non-English
   catalog structure is an unsupported-document error. Navigation is used only
   to discover locations, never as quoted article evidence.
4. Resolve real catalog anchors against the retrieved source, ignoring `<base>`.
   Filter excluded URLs, hidden/localized subtrees, query-bearing links and
   release-pinned paths. Strip fragments and deduplicate by validated source URL.
5. Reuse the evidence tokenizer and stopword list. Candidate score is twice the
   distinct question-token matches in link text plus matches in the URL path;
   ties use code-unit URL ordering. Keep the five highest positive-score sources.
   Duplicate links retain their maximum score. No question is sent over HTTP.
6. Search the shortlist sequentially in rank order, stopping at the first page
   with qualifying article evidence. If no catalog match or no searched page
   qualifies, return explicit `no_evidence` with the docs scope URL. Retrieval
   errors stop the call; they never masquerade as no evidence or stale success.
   Optional `url` bypasses discovery and narrows the search to that page.
7. Each fetched target is independently authorized by `src/retrieval.ts`, including
   redirect locations before any follow-up GET. Only HTTPS, exact `kubernetes.io`,
   `/docs` segment boundary, no credentials/nondefault ports/query, no raw controls,
   backslashes, encoded paths or dot-segment traversal. Relative ordinary paths
   and root-relative paths are resolved without concealing raw syntax. Follow
   only 301/302/303/307/308, with at most three hops; reject loops, missing/unsafe
   locations and unexpected transport-followed redirects. Return final source
   identity for both citations and persistent records.
8. Each chain has a 15-second header/body deadline and a 2 MiB decoded UTF-8 HTML
   limit. A tool call has a 30-second overall deadline. At most six HTML documents
   (catalog plus five candidates), at most 24 GETs including redirects, no retries
   or further article-link traversal. Error/redirect bodies are cancelled without
   being consumed. Cancellation and shutdown prevent late publication.
9. `src/evidence.ts` keeps the existing English article-only literal extraction,
   unique real heading IDs, lexical body/heading ranking and stable document-order
   ties. Return at most five excerpts from the selected source, not generated
   interpretation. Prose whitespace collapses; code whitespace remains. Per-quote
   and final JSON bounds/omission notices remain unchanged.
10. Only complete successfully parsed online documents enter the existing private
    persistent store, keyed by final URL/body with immutable insertion dates.
    Discovery and target pages use exactly the same retention machinery. No raw
    document or cached page reference is carried across the next network await;
    discovery returns URLs and retrieval returns only selected evidence.

## Deliberate ceilings

Title/path lexical discovery can miss body-only terms, inflections and synonyms.
The five-page shortlist and first-evidence stopping rule are bounded recall, not
complete coverage of Kubernetes documentation. If broader recall is required,
replace the ranking/index seam with an official full-text index; do not add URL
heuristics or broaden the allowed hosts. The catalog HTML is parsed once for
validated persistent storage and once for discovery, avoiding a new cache format.
The working parsed-page slot and O(n) persistent sweep are unchanged.

## Review and verification seams

- `test/index.test.ts`: unchanged QA question-only schema/metadata gate plus
  question-only registered execution, bounded multi-page discovery, deduplication,
  security exclusions, global cross-project restart/concurrency/expiry and
  preservation of unrelated/legacy files, no-evidence/errors, total
  deadline, cancellation and shutdown. The opt-in live QA gate observes actual
  official requests and validates returned literal excerpts against fetched HTML.
- `test/retrieval.test.ts`: strict inputs/sources/versions, allowed/unsafe redirects,
  final identity, chain bounds, streams, UTF-8, deadlines and sanitized failures.
- `test/evidence.test.ts`: literal extraction/citations/output limits plus stable
  catalog ranking and structural rejection; independent retention clock checks.
- `test/persistence.test.ts`: fresh-process persistence, original insertion dates,
  automated expiry without lookup, resume/clock reversals, tampering, races and
  filesystem retry semantics. No storage-format change is introduced here.

The existing QA defect was reproduced before the source correction: a question-only
registered call threw `Invalid input.`. Independent review/testing must evaluate
this corrected path, not just known-URL compatibility tests. Provider-mediated
smoke remains explicitly waived and unverified. No auth inspection or publication.
