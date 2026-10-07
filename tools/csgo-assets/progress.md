Original prompt: Open a PR for a realistic CS:GO Dust II 5v5 3D game using real CS:GO assets, sounds and all gun types; send screenshot updates every five minutes and do not merge until 95% of the agreed feature baseline is implemented.

## Current work

- User confirmed one human with nine bots; ten-human networking is out of scope.
- Added `game.html` with a converted textured Dust II Workshop port, static props,
  collision probes and a precomputed 4,327-node connected navigation graph.
- Added offline match state, buying, 34 firearms, ammunition, reloading, basic
  damage/armor, grenades, C4, round transitions, halftime and spectator controls.
- Converted 34 animated weapon viewmodels with hands and textures; repaired
  SourceIO's missing first-texture references and textureless materials directly
  from the supplied VTF/VMT files. The tests now reject textureless opaque materials.
- Added 34 textured world-weapon models, CT/T character models and hand attachments.
  Character motion is attributed, retargeted GMod motion, not original CS:GO animation.
- Restored 20 map alpha materials, including foliage and chain-link fencing.
- Added ammunition-preserving weapon pickup, reload cancellation on switching,
  exact firing-audio mappings for all firearms, stereo audio and simple wall occlusion.
- Added an engine-bundled preview build. Fonts still have a network fallback.
- SourceIO's hidden master-instance collection initially produced overlapping
  unplaced geometry. Visible-only export fixed that conversion error.
- Original asset-intake work remains below; `GAME.md` describes current limitations.

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

- Exact movement, ballistics, recoil, grenade physics and original-renderer parity.
- Original CS:GO character locomotion, per-weapon pose qualification and complete radio mapping.
- High-skill bot behavior qualification, full-match reliability and presentation-hardware performance.
- No approved parity baseline or measured 95% completion.
- No dashboard integration.
- The pinned map is a community CS:GO port, not an independently verified original game build.
- Independent Chinese copy review and maintainer signoff remain pending.
- Keep the PR draft and do not enable auto-merge.

## Verification results

Current game work:

- 26 local Node tests pass, including all 34 viewmodels, 34 world models, both
  characters, firing audio mappings, inventory behavior and map graph connectivity.
- 73 generated map/model/navigation files have SHA-256 entries. Binary asset
  tests skip in CI when those ignored assets are absent; local results are separate.
- The earlier browser run physically traversed all 60 spawn-to-site routes,
  exercised movement, firing, reloading, buying and two round transitions with
  no page errors. The updated character/audio build is undergoing another run.
- Full-match, reference fidelity and presentation-hardware approval are not inferred
  from these local tests. The parity gate remains unsatisfied.

Original asset-inspector work:

- All 1,055 files passed byte-size, SHA-256 and format checks; a second check reused
  all files with no downloads.
- Ten Node tests cover the importer, manifest and acceptance-report logic.
- Playwright selected and loaded all 34 models, exercised orbit, reset, wireframe,
  theme, language, audio play and stop controls, and recorded no uncaught page errors.
- Explicit missing-model and missing-audio requests produced visible error states.
- A narrow-screen clipping issue was found and corrected with aspect-aware camera framing.
- English and Chinese desktop/mobile views were inspected. This is asset-tool QA,
  not weapon-fidelity or gameplay acceptance.
