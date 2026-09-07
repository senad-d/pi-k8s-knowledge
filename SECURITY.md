# Security Policy

## Reporting a vulnerability

Do not post exploit details, credentials, private prompts, or session files in
public issues or pull requests.

Use GitHub's **Report a vulnerability** action on the repository's
[Security tab](https://github.com/senad-d/pi-k8s-knowledge/security), if private
vulnerability reporting is enabled. Its availability has not been verified.
If the action is unavailable, open an issue requesting a private reporting
channel **without including vulnerability details**. The author's GitHub noreply
address is not a security contact inbox.

Include the affected package/Pi/Node versions, operating system, a minimal
sanitized reproduction, expected versus observed behavior, and potential impact.
Use synthetic data. Coordinate disclosure with the maintainer; no response-time
or fix-time SLA is promised.

## Supported versions

Version 0.1.1 is the latest published version verified on the public npm registry.
Reports against that release and the current main branch are welcome. No
commitment is made to backport fixes to older versions or to provide a response
or fix within a particular time.

## Runtime permissions and boundaries

This is a Pi extension, not a sandbox. It runs with the Pi process's permissions.
Review the source and dependencies before loading it.

- No cluster access, kubeconfig reads, or Kubernetes credentials are required.
- Retrieval uses HTTPS GET requests restricted to authorized English
  `kubernetes.io/docs` pages. Redirect targets are validated individually.
  Questions are matched locally, not submitted as remote search queries.
- Retrieval is bounded by document count, redirect count, decoded size, and
  deadlines. No offline fallback supplies evidence after a failed request.
- HTML is parsed as data, not rendered in a browser. Retrieved excerpts remain
  untrusted source material; source allowlisting does not make them instructions
  or guarantee that model interpretation is correct.
- Pi, its configured transport, other extensions, and the operating system are
  outside this extension's isolation guarantees.

## Local storage and privacy

Retrieved HTML is retained in `~/.pi/.k8s-knowledge/`, shared across projects and
sessions for the same home. It is reused only after a successful online fetch
returns identical HTML. The extension does not store questions or transcripts
there; Pi and model providers may retain tool arguments and results separately.

Retention is 30 days from original insertion, not last access. Sweeps run during
active operation and on startup. No daemon deletes records while Pi is closed;
suspension, blocked execution, clock changes, and filesystem failures limit
physical cleanup. Expiry is not secure erasure and does not remove backups.

To remove retained documentation manually, first stop Pi sessions using this
extension, then remove only the dedicated `~/.pi/.k8s-knowledge/` directory.
Do not delete the parent `.pi` directory. Uninstalling the package does not imply
that retained documentation or Pi's own session history is removed.

## Dependencies and releases

parse5 and its transitive dependencies are installed from npm. Pi and TypeBox
are host-provided peers. Development installs use the lockfile; consumers resolve
production dependencies from the published manifest. Review dependency updates
and the actual npm artifact before release. The exact-file package test helps
exclude private state but is not a general-purpose secret scanner.

See the [README](README.md) for public limits and the source repository's
[testing documentation](https://github.com/senad-d/pi-k8s-knowledge/blob/main/docs/testing.md)
for storage and test-isolation details.
