# Changelog

User-visible changes are recorded here. Unreleased entries describe this checkout,
not proof of an npm release. Move them into a dated version section when released.

## Unreleased

### Added

- c8 coverage reporting for the existing Node tests, Sonar-compatible LCOV, and
  an 81% per-source-file gate for lines, statements, functions, and branches.

- ESLint with recommended JavaScript/TypeScript rules and zero-warning enforcement
  in validation, CI, and pre-publish checks.

- `k8s_knowledge`: question-first retrieval of official English Kubernetes
  documentation evidence, with optional page narrowing and latest-only support.
- `/k8s-knowledge`: extension status without documentation retrieval.
- Bounded catalog discovery, validated redirects, literal excerpts, and
  page/section citations with explicit output limits.
- Shared home-relative documentation retention across projects and Pi restarts,
  with fixed 30-day expiry and mandatory online validation on every lookup.
- Native Node regression tests and production tarball installation/Pi-loading checks.
- Public package metadata for `@senad-d/pi-k8s-knowledge`, MIT licensing,
  application icon, installation documentation, and maintainer guidance.
