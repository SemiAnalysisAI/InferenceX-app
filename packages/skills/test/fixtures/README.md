# Published 0.1.0 downgrade fixture

`semianalysisai-inferencex-skills-0.1.0.tgz` is the immutable, reviewed archive
published as `@semianalysisai/inferencex-skills@0.1.0`, from source commit
`cc9b6092f837aa8c88f131eaa909103679a194c4`. It is retained unchanged for an offline
regression using the actual legacy installer, including in shallow CI checkouts.

SHA-256: `83d5b12ce4de5f34200242acb527dc475102060a5e4056746b7a7548f4b8525e`.

The regression installs the current candidate, force-installs this old archive,
and verifies that the newer status command detects the stale version record.
The fixture is test-only and excluded from the public npm package's file list.
Its bundled `LICENSE` is GPL-3.0-or-later.
