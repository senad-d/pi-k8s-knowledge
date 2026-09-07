# Contributing

## Bugs and proposals

Use the repository's issue templates. For suspected vulnerabilities, follow
[SECURITY.md](SECURITY.md) instead of posting details publicly. Keep reports and
reviews respectful and focused on the work.

Include the extension, Pi, Node.js and OS versions; sanitized tool arguments;
expected and actual behavior; and a minimal reproduction. Do not attach real
credentials, kubeconfig, private session history, or your `.pi/` directory.
Discuss significant scope or dependency changes before implementing them.

## Local development

Requires Node.js >=22.19.0 and npm. Pi 0.85.1 is the verified host.

```sh
npm ci --ignore-scripts
npm run validate
npm run dev
```

Use `/k8s-knowledge` in Pi to confirm loading. Avoid loading both an installed
copy and the local entry point. Manual tool calls use the real documentation
network and home storage; ordinary automated tests use synthetic data and
isolated directories.

```sh
npm run typecheck
npm test
npm run check:pack
RUN_PACKAGE_INSTALL=1 npm run check:pack
```

The last command downloads public npm dependencies and verifies production
installation and Pi loading without provider credentials. Live-site tests are
separate; see [docs/testing.md](docs/testing.md). Do not claim skipped checks as
passed or inspect someone else's authentication to run a smoke test.

## Change guidelines

- Follow [AGENTS.md](AGENTS.md): reuse existing code and keep changes small.
- Preserve trust-boundary validation, bounded output, cancellation, and storage
  expiry. Do not silently expand the retrieval scope or add offline fallback.
- Add a small runnable regression for changed nontrivial behavior, using the
  existing native Node tests. No new test framework is needed.
- Update the README for public behavior, SECURITY.md for runtime/privacy changes,
  and CHANGELOG.md under Unreleased for user-facing changes.
- When adding shipped files, update both package.json's exact allowlist and
  `test/package.test.ts`. Never broaden it to include private state or residue.
- Do not commit generated tarballs, credentials, caches, or local Pi state.

## Pull requests

Use the PR template. Explain the problem, the smallest useful fix, and checks
actually run, including skips or failures. Keep unrelated refactors separate.
Contributions are made under this repository's [MIT license](LICENSE); submit
only work you have permission to contribute.

Publication is a maintainer action, not part of a normal contribution. See
[docs/publishing.md](docs/publishing.md) for release gates.
