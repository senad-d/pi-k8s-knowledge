# pi-k8s-knowledge

Kubernetes knowledge extension for [pi](https://github.com/earendil-works/pi-mono).

**Status:** development skeleton. Registers `/k8s-knowledge` to confirm loading;
knowledge search and retrieval are not implemented. No network requests, cluster
access, kubeconfig reads, or background processes are performed.

## Development

Requires Node.js 22+ and the pi CLI.

```sh
npm install
npm run check
npm run dev
```

In the resulting interactive pi session, run `/k8s-knowledge`.
`npm run dev` loads `src/index.ts` explicitly for quick testing; restart that
session after edits.

For persistent local loading with `/reload`, run from this directory:

```sh
pi install -l .
```

Restart pi, trust the project when prompted, and use `/reload` after edits.
Use either the installed package or the explicit development entry point, not
both. Project-local pi settings and existing agent state are ignored by Git.

## Layout

```text
src/index.ts        Default extension factory and command registration
test/index.test.ts  Registration and UI/headless smoke tests
package.json        pi resource manifest, scripts, and dependencies
tsconfig.json       Strict TypeScript checking (no build output)
```

Pi loads TypeScript directly; no build step is required. The `pi.extensions`
manifest points to `src/index.ts`. Pi's API is a peer dependency supplied by the
host, with a development dependency for local type checking. Add third-party
runtime libraries to `dependencies`, not only `devDependencies`.

Keep the entry point small as capabilities grow: extract knowledge retrieval,
source handling, and tool registration into focused modules with tests. Future
tools should validate inputs, respect cancellation, bound output, cite sources,
and distinguish documentation retrieval from live cluster operations.

## Packaging

`npm pack --dry-run` previews the package contents. Source TypeScript is included;
tests and local configuration are not. The package is intentionally marked
`private` until its publication name, license, and release policy are decided.

## Pi references

- [Extensions](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/docs/extensions.md)
- [Packages](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/docs/packages.md)
- [Examples](https://github.com/earendil-works/pi-mono/tree/main/packages/coding-agent/examples/extensions)
