# CS:GO asset intake

This is development tooling for the requested Dust II game. It is not the game,
not integrated into the dashboard, and not ready for the proposed presentation.
No claim of 95% feature parity is made. The PR must remain a draft.

## Verified inputs

- **Weapon geometry:** 34 OBJ files extracted from
  [Valve's Workshop archive](https://media.steampowered.com/apps/csgo/workshop/workbench_materials.zip?v=103),
  linked on the [official resource page](https://www.counter-strike.net/workshop/workshopresources).
  This is the legacy workbench download, not the separately listed CS2 geometry download.
  The archive also has UV sheets and finish examples, but it does not supply a
  complete animated, textured, first-person weapon pipeline. The inspection page
  uses a neutral material, not an invented skin or a claim of original texturing.
- **Audio:** 1,021 WAV files under `sound/weapons/` and `sound/player/footsteps/`
  from [sourcesounds/csgo at the pinned commit](https://github.com/sourcesounds/csgo/tree/08f1bd6835d4f510d2ccaedeab6bb9f637b388ab).
  This is a third-party mirror describing its files as CS:GO audio. Its exact
  source game build and fidelity to the eventual reference build are unverified.
  Presence in the inventory does not establish a correct gameplay event mapping.
- **Integrity:** the archive and every restored file have pinned SHA-256 hashes.
  Audio files also have the upstream Git blob identity. All 1,055 files were
  restored and byte-checked on 2026-10-06. Downloads total roughly 180 MiB after
  extraction, so binary assets are ignored rather than committed to Git.

The requesting maintainer reported permission from Steam for game assets,
including sounds and guns, on 2026-10-06. This records that statement; it does not
independently verify the agreement. Valve and other creators retain their rights.
This repository's code license does not relicense these assets. Do not assume
permission for third-party skins, modifications or third-party game code.

## Reproduce

Requires Node.js 20.11+ and `unzip`. These standalone tools do not require the
dashboard's dependency installation.

```sh
node tools/csgo-assets/prepare.mjs
node tools/csgo-assets/prepare.mjs --check
node --test tools/csgo-assets/*.test.mjs
python -m http.server 8765 --directory tools/csgo-assets --bind 127.0.0.1
```

Open `http://127.0.0.1:8765`. Select a weapon, orbit/zoom the original mesh,
inspect its wireframe and play the selected audio sample. Audio is user-initiated,
with an initial volume of 30%; stop playback with Stop, another selection or by leaving
the page. The viewer supports English and Simplified Chinese, light/dark
inspection backgrounds, and responsive layout. It loads Three.js from a pinned
jsDelivr package and fonts from Google Fonts. It is not an offline deployment.

For geometry only, use `prepare.mjs --models-only`. `--check` never downloads or
modifies files. Import validates sizes and hashes, restricts download hosts,
rejects path traversal and symlinks, limits response sizes, and replaces each
asset atomically after verification. An interrupted run can be retried.

## Dust II source findings

The [Valve Developer Community map inventory](https://developer.valvesoftware.com/wiki/Counter-Strike:_Global_Offensive/Maps)
describes official Workshop compatibility versions. A reference CS:GO build and
corresponding map, materials, props, collision and navigation data still need to
be obtained and pinned. A screenshot is not map geometry.

The search also found:

- A [CS:GO Dust II model listing](https://sketchfab.com/3d-models/dust2-csgo-read-description-e22d9329472c4b0da86905f1aa5514ef)
  whose uploader says the textures were omitted. It has not been imported or
  verified as the required version.
- [DuskRain's asset documentation](https://github.com/ETO-ze/dust2-web/blob/main/docs/ASSETS.md)
  explicitly identifies its map and weapon exports as CS2 rather than CS:GO.
  Its [license notice](https://github.com/ETO-ze/dust2-web/blob/main/LICENSE.md)
  does not grant a general open-source license for its original code. Neither
  code nor assets from that project are used here.
- [de_dust2_largo](https://github.com/rolivencia/de_dust2_largo) is a modified
  side-passage map, not the full original Dust II. It is not used.

## Acceptance and merge restriction

`acceptance.json` is a proposed coverage checklist, not an approved definition of
“95% of CS:GO.” It includes full-map visuals and collision, weapons, movement,
grenades, bomb logic, rounds, economy, bots, audio, HUD, spectators, networking,
stability and dashboard isolation. Each row must be expanded into reproducible
reference test cases before signoff. No gameplay category is implemented by this
asset tooling.

Before game implementation is accepted, confirm:

- The CS:GO reference build and map digest.
- Browser integration in InferenceX versus another target.
- Whether 5v5 requires ten humans, one human plus bots, or both. The proposal
  conservatively includes both; it does not silently waive networking.
- Presentation hardware, acceptable performance and the presentation date.
- The final weights, required cases and explicitly excluded cosmetic features.

```sh
node tools/csgo-assets/parity-gate.mjs
```

The report currently exits 1: unapproved baseline, unpinned reference, zero
evidence-backed gameplay checks. Passing requires an approved baseline, pinned
build/map, at least 95% checklist weight, evidence URLs for passing checks, and
every required check passing. The script checks report completeness, not whether
the evidence proves the claimed gameplay. A reviewer must inspect that evidence.
It is not a GitHub branch-protection rule and cannot prevent a maintainer bypass.
The dedicated CI workflow runs tooling tests separately from this acceptance
report. Its game-acceptance job is intentionally red while the game is unfinished;
green importer tests must never be reported as green gameplay acceptance.

This change adds no dashboard imports, routes, theme controls, API surface or
published indexable pages. No benchmark data, filter, calculation, API or
`inferencex-skills` behavior changes. The standalone inspection tool is a
development-only presentation surface.

## 中文说明

这是 Dust II 游戏的素材准备工具，不是可玩的游戏，也未接入 InferenceX 仪表板。
当前 PR 必须保持草稿状态，不能声称已实现 95% 的功能。

- 从 Valve 官方 Workshop 压缩包提取了 34 个原始 OBJ 武器模型。预览使用中性材质，
  不包含完整的原始贴图、手臂或动画。
- 从固定提交的第三方 `sourcesounds/csgo` 镜像获取了 1,021 个武器与脚步 WAV 文件。
  镜像对应的具体游戏版本尚未核实，文件齐全不代表游戏音效映射已经完成。
- 共 1,055 个文件已通过字节大小与 SHA-256 校验。音频还校验上游 Git blob 标识。
  二进制文件不会提交到 Git，可用上述命令恢复；`--check` 只校验，不下载或修改文件。
- 请求者表示已获得 Steam 的游戏素材使用许可。此处仅记录该陈述，不代表已独立核实协议，
  也不将许可扩大到第三方游戏代码、改制内容或皮肤。
- `acceptance.json` 只是待确认的验收清单。具体 CS:GO 版本、地图哈希、部署目标、
  真人联机范围、演示设备及日期尚待确认，所有玩法检查均未通过验收。
- 检查脚本当前应返回非零状态。它验证验收报告是否完整，不自动证明测试结果真实，
  也不等同于 GitHub 分支保护规则。

工具页面可切换中英文，支持模型旋转、缩放、线框检查和手动播放音频。
本次改动不新增仪表板路由或生产环境导入，不修改数据、API 或公开技能包。
