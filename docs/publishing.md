# Publishing and release verification

## Current release

`@senad-d/pi-k8s-knowledge` 0.1.1 is public on npm under the `latest` tag. The
npm registry records its publication at `2026-09-07T08:57:48.979Z` and reports:

- tarball: `https://registry.npmjs.org/@senad-d/pi-k8s-knowledge/-/pi-k8s-knowledge-0.1.1.tgz`
- integrity: `sha512-bA4uaRRsM+XGwFOBlwjjsjDv79gdl+/TQI5UKjsLNBu+9KaJ3hRFIlLDP8/sePR3Ol3H2rYL1NajJziFo4jz3A==`
- MIT license, Node `>=22.19.0`, and Pi entry point `./src/index.ts`
- runtime dependency `parse5@8.0.1`; Pi and TypeBox remain host peers

The version manifest, packument, and tarball URL were reachable when checked.
The official Kubernetes documentation root and a representative English page
also returned HTML successfully. These are registry and HTTP reachability facts,
not proof that the registry artifact loads or retrieves evidence correctly.

Earlier package integration checks packed this local checkout, installed that
local tarball, loaded it through Pi, and used synthetic Kubernetes HTML. They did
not install 0.1.1 from the registry or call a model provider. A registry install,
Pi load, live question-first retrieval, and provider-mediated smoke for the public
artifact have not been performed.

## Publish a later version

1. Update the version in `package.json` and `package-lock.json`. Move only verified
   release changes from `CHANGELOG.md` into a section with the intended version
   and release date.
2. Review the package manifest and shipped files, then run:

   ```sh
   npm ci --ignore-scripts
   npm run validate
   npm run check:pack
   RUN_PACKAGE_INSTALL=1 npm run check:pack
   npm run pack:dry-run
   ```

   `check:pack` builds a local tarball. Its opt-in integration installs that local
   artifact and uses synthetic site responses; neither command verifies a package
   downloaded from npm.
3. Dispatch `.github/workflows/publish.yml` from the default branch with the
   intended npm dist-tag. The workflow rejects an existing package version or Git
   tag, installs on Node 22.19.0, runs `npm run validate`, publishes with public
   access and provenance, and then creates and pushes `v<version>`.
4. Do not treat ordinary CI as a publication or production-install check.
   `.github/workflows/ci.yml` runs `npm run validate` on Linux with Node 24; the
   live-site and package-install checks are opt-in and are not part of that job.

## Verify a published version

1. Query the public registry and compare its version, `latest` tag when applicable,
   publication timestamp, license, engine, Pi entry point, dependencies, tarball
   URL, and integrity with the reviewed release:

   ```sh
   npm view @senad-d/pi-k8s-knowledge@<version> --json --registry=https://registry.npmjs.org/
   ```
2. In a clean, non-sensitive environment, test the exact registry version without
   persisting a package entry:

   ```sh
   pi -e npm:@senad-d/pi-k8s-knowledge@<version>
   ```

   Run `/k8s-knowledge`, then ask a representative question that lets Pi call
   `k8s_knowledge`. Record registry installation/Pi loading, live retrieval, and
   provider-mediated behavior as separate results; one does not prove the others.
3. Confirm the source and section links returned by the tool are reachable. A
   direct HTTP success alone does not establish successful discovery, parsing, or
   evidence selection.

See [testing](testing.md) for the exact synthetic, live-site, and provider check
boundaries.
