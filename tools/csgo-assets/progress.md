Original prompt: Open a PR for a realistic CS:GO Dust II 5v5 3D game using real CS:GO assets, sounds and all gun types; send screenshot updates every five minutes and do not merge until 95% of the agreed feature baseline is implemented.

## Current work

- Located and downloaded Valve's legacy Workshop weapon archive.
- Restored 34 original OBJ weapon meshes and 1,021 WAV weapon/footstep files.
- Added size, SHA-256, Git blob, file-format and path-safety validation.
- Added an EN/ZH development-only model/audio inspector.
- Added a proposed acceptance report that explicitly fails pending baseline and gameplay evidence.
- Captured the actual AK-47 geometry inspector, clearly labeled as not gameplay.

## QA inventory

- Verify every asset hash and expected format; replay the importer without downloads.
- Unit tests: corrupt hashes, corrupt sizes, invalid formats, forbidden hosts, HTTP
  failures, oversized responses, traversal, symlinks and atomic writes.
- Gate tests: unapproved baseline, omitted reference, missing evidence, 95% score
  with a missing mandatory feature, invalid weights and changed threshold.
- Browser controls: every model loads; original audio plays; selection interrupts
  old audio; wireframe toggles; orbit/zoom/reset; language toggle; light/dark toggle.
- Browser failure paths: missing model, missing audio and WebGL failure messaging.
- Desktop and narrow viewport rendering in both languages.

## Not completed

- No game loop, full Dust II map, collision, weapons gameplay, animations, bots,
  multiplayer, economy, grenades or bomb mode.
- No approved parity baseline or measured 95% completion.
- No dashboard integration.
- No original map asset pinned. Sources found are documented in README.md.
- Independent Chinese copy review and maintainer signoff remain pending.
- Keep the PR draft and do not enable auto-merge.

## Verification results

- All 1,055 files passed byte-size, SHA-256 and format checks; a second check reused
  all files with no downloads.
- Ten Node tests cover the importer, manifest and acceptance-report logic.
- Playwright selected and loaded all 34 models, exercised orbit, reset, wireframe,
  theme, language, audio play and stop controls, and recorded no uncaught page errors.
- Explicit missing-model and missing-audio requests produced visible error states.
- A narrow-screen clipping issue was found and corrected with aspect-aware camera framing.
- English and Chinese desktop/mobile views were inspected. This is asset-tool QA,
  not weapon-fidelity or gameplay acceptance.
