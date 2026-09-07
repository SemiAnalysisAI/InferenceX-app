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

# Published 0.11.0 upgrade fixture

`semianalysisai-inferencex-skills-0.11.0.tgz` is the immutable archive reviewed
before `@semianalysisai/inferencex-skills@0.11.0` was published. It was prepared
from source commit `a179d8adc54092eb522bf0a6112c3720ff1a51a4`; the merged source commit was
`25e7ee40b1854d34f8f7500332bf2b111b58f48f`.

SHA-256: `ec2dd84c67e1feb59492217f3549bd2989aae3bb4f6dba694c45c8cbf250af5f`.

The regression installs this archive before upgrading to the current candidate,
so compatibility stays testable offline in shallow CI checkouts. The fixture is
test-only, excluded from the public npm package, and includes GPL-3.0-or-later.
