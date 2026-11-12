# VideoGenX results (/vgx)

`VideoDashboard` renders the same shared results view at `/vgx` and `/zh/vgx`.
It preserves the existing feature gate, route registry, published History reader,
and sealed media loader. All visible copy lives in component-local `STRINGS`.

## Selection and evidence

Stored Blob indexes and matching publication approvals →
`GET /api/video-runs?format=history` → `videoPoints` →
`resultProjection`. Reads fetch at most five pages in one request
(`page=1&pages=5`); the view API reports pagination coverage. History retains unapproved stored sources; `videoPoints` admits only
entries with an approval receipt matching their original source and checkout.
Approval is separate from full-sweep or release qualification. The browser never
publishes a run or generates a clip. The read-only
`GET /api/v1/views/video?view=overview` returns the same selectors and calculations.
Legacy dashboard, compare, results, tradeoff and discovery API modes remain.

Comparisons require one complete canonical workload identity, C1, exactly 20
scheduled clips and at least ten valid samples on every hardware. Model revision,
all generation settings, prompts, seeds and measurement semantics remain in the
identity. The default selects the cohort covering the most target hardware.
Smoke, incomplete and unmatched evidence stays in Performance history. MI355X is
listed before its first matched run, without invented results. GB200, H200 and H100
join the roster when qualified approved evidence or the exact named diagnostic run
is available, with the same workload and sample requirements. Its label and costs use the hardware registry. These are
comparison targets, not claims that all models run on all hardware.

Latest observations are selected separately by workload, hardware, deployment
and runtime: the engine plus the optimizations its run configuration declares
(`configuration.optimizations`). Both come from recorded configuration. Missing metadata
is not filled from a runtime SHA or hardware name. A cell published before server
layouts were recorded cannot be told apart from a recorded layout at the same GPU
count, so a newer cell with the same hardware, runtime, GPU count and concurrency supersedes
it; older runs selected through Run context still show it. The overview includes all
GPU counts for the same workload, with no GPU-count selector. Workload-mix rows preserve each
cohort separately rather than averaging across resolutions, durations or modes.

`r_*` URL parameters record filters, hidden hardware, the X and Y metrics (`r_x`, `r_y`),
Optimal only (`r_optimal`), the open deployment
(`r_point`), deadline, cost tier, entered mode prices and utilization. The clip stage's
`r_view`, `r_prompt` and `r_clip` stay in the page URL and are not API parameters; the
overview API rejects them as unknown.
The retired `r_gpus` and `r_basis` parameters are accepted but ignored by the
UI and overview API: all GPU counts and participating GPUs
are fixed. New share/export URLs omit these keys. Both GPU cost bases
remain available as evidence, not selectable chart settings.
`r_workload` uses a compact source point identifier;
canonical workload JSON stays inside the projection. Share includes the `r_`
registry scope. `?unofficialrun=<id>` reads only that run through
`namedRunPoints`. A stored run keeps its actual approval status. A run absent from
the History pages is read live from its GitHub artifacts through
`/api/video-runs?run=<id>&format=live`: the newest attempt of each native
`h3-results` configuration, JSON documents only, fetched by explicit byte ranges and
verified against `SHA256SUMS` and the manifest identity. Its entries are unapproved,
have no `publishedAt` and no media, so the clip panel shows nothing for them and the
banner says the run is unpublished. While selected, that run
appears only in `overlayCells` and `overlayDeploymentCells`, even if approved; it
leaves official cells, deployment cells and workload mix. `overlayCells` and
`overlayDeploymentCells` retain all
matching GPU counts for the chart and deployment detail. Clearing the selection cannot promote an
unapproved source. Dismissal clears a workload selection absent from the approved
choices and preserves valid approved selections. All comparison filters and sample requirements still apply.
Unknown runs and runs without readable native artifacts remain unavailable; the URL
cannot trigger publication, storage writes or GPU work.

Approved evidence determines the preferred cohort. A workload available only in
the named run requires explicit selection, or becomes the fallback when no approved
cohort matches. The browser retains one bounded History read and rederives both
lists when the URL changes. Legacy dashboard/compare APIs remain approved-only.
The overview API returns JSON by default. `format=csv` downloads the same selected official and named cells with exact source/workload/run/artifact identities, approval state, units and both GPU cost bases. `duration_s` retains the requested plan duration; `video_seconds_per_s` reports validated decoded output seconds per wall second. Missing values remain empty cells; CSV is private and no-store.

The Workload menu shows compact summaries derived from recorded model and generation
metadata. Its existing help control shows the full source label, exact source
point ID. Matching summaries get distinct source-ID suffixes. This is presentation
only; query IDs and API projection values remain unchanged.

## X-axis metric

Chart config's X-axis metric (`r_x`) is median latency per clip (`p50`, default), P90
latency per clip (`p90`) or GPUs per deployment (`gpus`). The GPU axis plots participating
GPUs on a log scale, ticked at the measured counts. A GPU count describes a deployment
rather than measuring it, so its registry entry sets `rankOn: 'p50'`: each series keeps
its median-latency frontier, and Optimal only and the Best engine match the median-latency
view. A deployment without a recorded GPU count cannot be placed on that axis, so it does
not rank there either. Point labels name GPU counts, so that axis hides them. Its hover
card shows median latency in place of the GPU count already in the summary, and the
details panel lists each latency not on the axis. Chip config history fixes every
deployment's GPU count, so it offers only the latencies and plots median latency while
`r_x=gpus` stays in the URL. Quality loss against lossless output (LPIPS) and peak GPU
memory appear under "Not measured yet" and cannot be selected until that data exists.
Named-run overlays use the same series and axes.

中文：图表配置中的 X 轴指标（`r_x`）可选单条视频中位延迟（`p50`，默认）、P90 延迟（`p90`）或每个部署的 GPU 数（`gpus`）。GPU 坐标轴按对数刻度绘制参与计算的 GPU 数，刻度只标在实测的数量上。GPU 数是部署的属性而不是测量值，因此注册表为它设置 `rankOn: 'p50'`：每组曲线沿用中位延迟下的 Pareto 前沿，「仅最优」和「最优」引擎与中位延迟视图一致。未记录 GPU 数的部署无法放到该坐标轴上，因此也不参与该坐标轴上的排名。数据点标签本来就写着 GPU 数，所以该坐标轴不显示标签；悬停卡片改为显示中位延迟，详情面板列出不在坐标轴上的各项延迟。芯片配置历史中每个部署的 GPU 数固定不变，因此只提供延迟选项并绘制中位延迟，URL 中仍保留 `r_x=gpus`。相对无损输出的质量损失（LPIPS）和 GPU 峰值显存列在“尚未测量”下，有数据之前不能选择。叠加运行使用同一套曲线和坐标轴。

## Layout

The page follows the inference and AgentX two-level layout. The overview has five parts:

1. The header card (`DashboardSectionHeader` with the page title, cohort help and Share)
   holds one line naming the fixed model, workload and engine, and `ControlPanel`s for
   Chart config (X and Y metrics), Compare history and Run
   context. Compare history's Chip config
   picks up to four deployments and an optional date range; the chart then plots each one's
   runs in time order, labelled by run date, plus a named overlay run's matching
   deployment as its own series, while the clips and cost caption keep
   the selected run. Run context reuses the inference run date
   picker and Run select: each official deployment shows its latest run on or before the
   selected run, and the run link opens its GitHub Actions run. Model and workload
   have no selectors while one cohort is published; a shared `r_workload` link still
   selects its workload. The replay label appears only when fixture
   replay is active.
2. The chart card is a `ChartSection` with the shared chart buttons (PNG export, CSV of
   the overview API's `format=csv`, legend toggle and zoom reset). The chart title sits in
   the chart caption so PNG exports carry it. The chart plots every measured deployment
   of the selected workload. X is a latency per clip or GPUs per deployment, described
   in X-axis metric; when every plotted deployment generates clips of one length and
   frame rate, a latency axis title names both. Y is video-seconds
   per $1 TCO (default), videos per GPU-hour or GPU kJ per valid clip.
   `results-chart.ts` registers each metric with its label, unit and better direction.
   Each hardware, runtime and run channel is one series with its own Pareto frontier;
   Optimal only hides dominated deployments. By default each hardware plots one
   lossless series, the one with the largest frontier area (`frontierArea`, the
   hypervolume rule of the inference best series per SKU); a named run ranks on its own.
   Chart config's Engine control, shown when the cohort has two engines, picks Best
   (default) or one engine. `r_compare`, which once drew every engine, is accepted and ignored. `optimizations.ts` classifies declared optimizations;
   an unknown key counts as lossy, and a lossy series never ranks. The legend's Lossy
   optimizations switch, shown when such series exist, adds them as dashed lines listed
   below the legend, such as "H100 (NVIDIA Sol Engine · Sol-Attn + FirstBlockCache)".
   Each lossy line brings its lossless twin's line, even where another engine is Best:
   `losslessTwin` (`deployment.ts`) pairs a lossy cell only with a lossless cell of the
   same run, hardware, engine, GPU count and server layout, preferring the same
   concurrency. A twin line is drawn as the comparison, so it never leads cards or clips.
   Under the lossy lines, a note says lossy configs trade some quality for speed and that
   scoring each one against its own lossless run is planned. Its See what
   changes action (`seeChangesPair`, `quality-method.ts`) plays a drawn lossy cell against
   its lossless twin in Wipe and reveals the stage as Compare below does. The named run's lossy cells
   come first and pair only within that run; then B200 and the roster, and each hardware's
   lossy lead. The action is absent unless both cells may have clips. Production has no
   lossy cells today, so the note and action are verified on fixtures.
   A change that first puts two engines on one GPU asks for the shared
   engine-comparison confirmation, and engine point shapes appear only then. Legend
   entries name each GPU's lossless engines, such as "H100 (SGLang)". Lossy deployments
   never lead a hardware in cards, clips or evidence comparisons. The sidebar legend toggles hardware,
   greys out roster hardware without a matched run, holds the deployment-label switch
   and a Reset filter action. Under the chart, a `ResultContext` footer like the
   inference one selects the cost tier, states the fixed participating-GPU basis, names the
   update date and source, lists each plotted hardware's TCO $/chip/hr rate in a
   `TcoPriceTable` and links the price source. Hovering a point shows the shared
   compact hover card (`chartHoverCard`): hardware and engine, both axis values, GPUs,
   deployment and concurrency. A stored point's card leads with its poster for the stage's
   prompt. When the stage has not read that point's clips yet, the card keeps the frame's box,
   pulsing like `Skeleton`, and resting on the point for 250 ms starts the same read a click would make; the poster
   fills the box when the read lands, and the box closes when the point has no poster or the read fails; a click reads it again. Resting
   on another point aborts the read, which never counts as the stage loading. Points of a
   live named run carry no media, so their card shows text only. Clicking a point opens the shared point details panel
   (`ChartPointDetails`): date, both axis values, energy, power and power limit first, then
   concurrency, participating and allocated GPUs, valid clips, deployment, each latency not
   on the X axis, cost and runtime. Unofficial points carry the run marker in
   both. The run link and View telemetry share the panel's fixed action row, so both stay
   visible without scrolling; View telemetry opens the deployment detail. The same click plays that
   deployment's clips on the stage below (`r_clip`), and the panel's Compare below action
   reveals the stage: once every read the stage needs has landed, so a prompt row arriving
   with a read cannot push it away, it scrolls the stage and its transport into view with
   `scrollIntoView({ block: 'nearest' })` and focuses the stage; the click alone
   never scrolls the page. Only stored cells (`publishedAt` set) may have clips. Points of a
   live named run draw hollow, and a click on one only pins its details; a stored cell
   without clips still shows the stage's empty state. The points the stage's two sides play
   carry Playing and Baseline badges. Until the reader first picks a clip (a point, the
   Compare row, Compare below or See what changes), every other stored point pulses with a
   ring spreading in its series colour; under `prefers-reduced-motion` the ring stays still.
   The ring lives inside its point, so redraws on hover and zoom do not restart it, and the
   PNG export leaves it out. Points and lines glide to new data over 300 ms, as on the
   inference scatter chart, and jump under `prefers-reduced-motion`; the badges, series pills
   and labels are redrawn on every frame of the glide, so they stay on their points. While
   the cohort loads, the plot shows a `Skeleton` instead of the note for an empty selection,
   and the loading status is announced to screen readers only; a reload with points on the
   plot dims the chart card with `motion-stale`. The badges and hollow points are a custom layer
   that reads the selection from a ref and redraws through the `D3ChartHandle`; the
   selection never reaches the plot's data, layers, tooltip or scale configs, because a new
   one rebuilds the plot and closes the panel the click just pinned. The same layer names
   each drawn series with a pill at its last frontier point, in the series colour and with
   the legend's wording ("B200 (SGLang)"; lossy series as a dashed outline, the named overlay
   run in `overlayRunColor`). A pill steps past or drops below a shown point label, pills that
   would overlap are pushed down 21 px at a time, and all stay inside the plot, follow zoom
   and pan, and appear in the PNG export. A plot narrower than 480 px names only the focus
   overlay lines, so a phone is not covered in unofficial pills. With deployment
   labels on, GPU-count labels show only on the focus series: the playing, baseline and
   hovered ones; a label is shifted inside the plot edge and skipped when it would overprint
   another. Chart lines, points, legend, pills and the stage, compare row and readout dots use
   a VideoGenX-only palette (`hardware-colors.ts`) with a light and a dark value per GPU, so
   H100 and H200 no longer share the site's NVIDIA green; other dashboards keep theirs. The representative
   deployments table and its deadline input have been removed; the overview API
   retains representative cells and deadline calculations for data consumers.
3. The clip comparison card described in Synchronized clips.
4. An always-open How to read these results card and a closed-by-default Advanced
   disclosure containing the profit estimator. Expansion is local presentation state;
   closing it preserves scenario inputs and does not change API calculations. How to
   read lists the measurements not yet collected. The profit estimator's mode prices
   and utilization sit in a Scenario `ControlPanel`. No placeholder chart, illustrative
   value or uncalibrated rating schema is shipped.
5. Performance history, collapsed under a chevron heading until opened or deep-linked,
   because opening it reads stored History pages.

`r_point` opens one deployment detail. Opening pushes a history entry marked in
`history.state` through the `client-navigation` helpers, so the in-page Back button
pops that entry even after reload or Forward. Browser Back also returns to the
overview at its previous scroll position. The overview stays mounted but hidden
under React `Activity`, so clip media, the selected clip group, loaded History pages
and chart state survive the visit. An unknown, filtered or hidden `r_point` falls
back to the overview. Once results load, the URL drops that key, so showing the
hardware again or Share cannot reopen it. Overlay deployments open the same way.

The detail header (`DashboardSectionHeader` with Share) names hardware, model, engine,
run date and any overlay run ID. Buttons switch between the measured deployments of that
hardware; dashed boxes mark GPU counts without a measurement. A spec grid lists GPUs, concurrency, engine,
runtime, workload, valid clips, power evidence and the hourly GPU rate. Three tabs
hold the evidence:

| Tab       | Contents                                                                                                                                                                                                         |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Telemetry | Per-clip latency distribution, recorded P50/P90/P95, deadline attainment, GPU board power trace, energy per clip and frame, throughput, both cost bases, warmup and failure categories, GPU memory when recorded |
| Validity  | Workload and manifest hashes, sealed validation, completion counts, power validity and the link to per-clip PSNR                                                                                                 |
| Sources   | Model, workload, runtime, run, artifact, observation and approval identities                                                                                                                                     |

P95 requires at least 20 aligned valid timings. A technical validity check does not
imply quality acceptance or release qualification. A median from a native harness is
not relabeled client latency. Power invalidation is propagated; power and energy stay
null when it fails. GPU-board energy excludes host, chassis and facility energy.

## Synchronized clips

`VideoResultsClips` reads `format=published` once per selected artifact. It validates
source identity and matches prompt, seed, repetition and recorded generation
configuration before showing clips together. Missing media does not erase numeric
evidence. The clips continue the chart's card below a rule and play on a two-sided stage
(`VideoClipStage`) as wide as the card: the pair, the baseline, on the left and the subject
on the right. A picture is never taller than the window less 18rem, so on a short window the
stage and its transport narrow and center, and the Compare row, picture, transport and readout
stay in view together under the header; Side by side sizes the cap for two frames. The chart point named by `r_clip` is the
subject when the chart draws it. Otherwise a visible point of the run named by
`?unofficialrun=` is the subject, with or without media. Otherwise the subject is B200's
opening deployment (`stageOpenings`): the lower-median latency point of the B200 lead's
frontier, so the stage opens mid-curve (4 GPUs among 1, 2, 4 and 8) instead of on the
efficient end that leads cards and comparisons or on the costliest fastest end. When B200 is
hidden or has no published clip, it is the first visible roster hardware with one, opened the
same way. The server seeds the opening deployment's clips with the leads'. A preferred side that is still loading holds its place, so the stage does not
jump when it arrives. A switch to a pair whose clips are not read yet (a clicked point, the
Compare row or Compare below) keeps the last pair on the stage and readout, dimmed by
`motion-stale` as the inference chart is while it refetches, until the reads land. The
chart's badges and the Compare row follow the pick at once, and the prompt row keeps its
tiles. The stage also keeps the last pair, undimmed, until the next pair's first frames load,
for at most 800 ms, so a switch of pair or prompt never shows black between frames. Before
the first pair lands, `Skeleton`s hold the prompt row and stage. The loading status is
announced to screen readers only. The Compare row reads "[config] compare [pairing]", two selects
in the site's select style. The first picks what plays: each visible hardware's opening
deployment and, with lossy lines on, each drawn lossy config at its lower-median latency
deployment (`compareConfigs`). A pick sets `r_clip` as a chart click does. The second follows
(`defaultPairing`): a lossy config's lossless twin; for a subject from `?unofficialrun=`, the
official cell of the same deployment on its GPU, else that GPU's official opening
(`officialCounterpart`); otherwise the subject's sealed Diffusers reference. It also offers each other visible
hardware's opening, the deployment the first select plays for it. The pair plays its own clip of the subject's prompt, seed and take; a
missing twin says so in place of the clip. That choice is page state that `VideoDashboard`
owns outside the URL, so the legend's See what changes can pick the twin. A new subject, from
the row or the chart, returns it to the default; a choice the subject lacks shows the reference. Pills name each side (hardware and engine, then the GPU
count plus a lossy side's optimizations or "lossless"; or the reference, marked official)
and carry its speaker. Sides
from `?unofficialrun=` use `overlayRunColor` and an Unofficial run tag. Prompt & sources
lists the two sides shown.

The stage has four views: Wipe (default), Side by side, Toggle and Difference. Wipe stacks
the sides and clips the right one at a split that follows the pointer; a click, or the
split handle, locks it, and `←`/`→` on the handle move it. Side by side places the two
clips next to each other and stacks them below 640 px. Toggle shows one side: a click on
the stage or `T` flips it, and holding Space shows the other side until release. Outside
Toggle, Space on the focused stage plays or pauses. Keys act only on the focused stage,
never on the document, and Space or Enter on a button inside it still activates that button.
From 820 px the prompt strip, the shown prompt and the view switcher share one row; narrower,
the strip and the prompt each take a full line. The prompt is the row's subject: 14 px ink
text clamped to two lines, with a More link when it overflows, after a semibold mono
`seed N` lead-in. "take N" appears in the lead-in and on tiles only when another loaded take
shares the prompt and seed, so production's one-take prompts show the seed alone. The strip
shows the tiles that fit, at most three plus the shown prompt's, and a "+N" tile that
expands it. A tile is the prompt's poster over its case id: the reference clip's poster for
that prompt, else the subject clip's. With neither, or when the image fails to load, it is a
text tile with the case id and seed. Posters load lazily as sized images and fade in over a
pulsing placeholder once loaded (`motion-media`). Resting the mouse
on a poster tile, or focusing it from the keyboard, loops the poster clip's muted web
rendition over the frame, faded in once it plays; the rendition is requested only then. A
touch only picks the prompt, and `prefers-reduced-motion` keeps the still frame. `clip-stage.ts` owns the stage's URL keys:
`r_prompt` (case id, `~take` after the first take, `diag:` for the matched-noise rerun),
`r_view` (omitted for Wipe) and `r_clip` (the subject's `resultsPointKey`). Its writer
replaces only those keys, and the dashboard's `commit` keeps them while it rewrites the
results keys. They are page state only: the overview API request is built from the results
keys and never carries them. An unknown prompt shows the first prompt, and an unknown,
hidden or undrawn `r_clip` plays the default subject; both stay in the URL. Changing the
prompt, the subject or the pair pauses and rewinds both sides; the view, the split lock and
the audio source stay.

The shared transport drives real video elements through the pure state
machine in `clip-sync.ts` (`paused`, `loading`, `buffering`, `playing`, `ended`).
`useClipGroup` snapshots every active clip each
animation frame (time, `readyState`, `seeking`,
buffered range, `playbackRate`), hands the snapshots and the user intent to
`stepClipGroup`, and applies the returned actions; no playback rule lives in the
component, and overlay clips from `?unofficialrun=` go through the same step. Wipe, Side by side and Toggle play
each clip's `previewUrl`, the web rendition described in [Video History](./video-history.md),
and fall back to the sealed original when none exists or it fails to load. Difference loads the
originals of both sides; PSNR and the media link always use the original. When a
rendition plays, Prompt & sources says so. No clip media is requested before the
first Play: videos render with `preload="none"` and their side's poster. When both sides have
a poster, the Wipe split already works over them; otherwise an idle frame (prompt, pills and
a Play button) covers the stage. The first Play sets `preload="auto"` inside the gesture
before priming.
Browsers treat `preload` as a hint, so this is best effort. After that first Play each clip
downloads in full, which keeps the few-second clips from stalling. While any clip is not yet buffered
from its time through the shared end (within 50 ms) with `readyState >= 3`, the transport
shows `Loading N%`, the share of the shared duration buffered by the slowest clip. Play
before that enters `loading` and starts every clip together once all are loaded;
scrubbing and replay after the end go through `loading` the same way. A clip that stalls
mid-play (not seeking, `readyState < 3`, for example after the browser evicted its buffer)
pauses every clip together into `buffering`, shown as `Buffering N%`, and the group
resumes from the leader's time once every clip has at least 1 s buffered ahead or a
buffer that reaches the end.
The leader is the audible clip when audio is on, otherwise the first clip that is not
stalled; the audible clip is never seeked to chase another clip. A follower drifting
40 to 250 ms gets a 10% `playbackRate` nudge and returns to the base speed once within 10 ms;
drift beyond 250 ms issues one seek, never while that clip is already seeking.
Scrubbing seeks every clip and re-buffers. With Loop off the group stops at the shared
playable duration; it pauses when the selection changes. A hidden page pauses playing clips but
keeps a pending `loading` or `buffering` start, which runs once the page is visible and
the clips are ready, so switching tabs while a clip downloads does not cancel Play. The time display
and scrubber refresh at most ten times per second.
Audio starts muted. Each playable side's speaker makes it the one audible clip, the
reference included; pressing it again mutes. A prompt switch keeps the audible source.
Hiding or failing the selected audio source restores mute. The layout effect that owns `muted` reapplies it
whenever the overview is revealed again behind a deployment detail, since React would
not reapply an unchanged prop. Audio selection is local playback state and
does not change the media, metrics, URL selectors or read-only API response.

Below the stage the transport holds Play, the scrubber, the time, Swap and Inspect. Swap
exchanges the sides' places (left and right in Wipe and Side by side, or top and bottom when
Side by side stacks, and the order of the Toggle buttons); the subject and its pair keep their roles, so the stage label and the facts
below still read subject against pair. Inspect opens a drawer with frame step, speed, zoom
and loop. Its state is local to the stage and survives prompt and subject changes. Frame step
pauses the group and seeks every side to the middle of the previous or next frame, so a
browser that rounds the seek still shows that frame; `←`/`→` on the focused stage do the same.
The frame rate is the workload's recorded `plan.generation.fps` (`resultMetadata`) and the
frame count its `frame_count`, capped by the playable duration; without a frame rate frame
step is disabled. Speed (0.25×, 0.5×, 1×) is the group's base `playbackRate`: drift
nudges stay within 10% of it, and every resume, scrub and source reload returns to it, never
to 1×. Zoom (1×, 2×, 4×) applies one CSS transform to both sides and the Difference canvas;
while zoomed, dragging the stage pans both, and `Esc` resets the zoom and unlocks the split.
Loop is on by default: at the shared end every side seeks to 0 together and restarts through
`loading`, so neither side loops on its own. Each control records a `video_results_` event.

Difference displays an amplified absolute RGB difference between the two sides at
matched playback time (within 0.12 s); the pair is an explicitly bound official
Diffusers reference MP4. Hardware and step
count alone never establish a reference. It shows "Both sides need a clip" when a side
has no playable media, and fails closed for unequal frame geometry or blocked
cross-origin pixel access. Blob media sends `access-control-allow-origin: *` and every
video sets `crossOrigin="anonymous"`. This preview is not a
sealed PSNR result. Distilled and full-step workloads are not silently equated.
Below the stage, a readout (`VideoClipReadout`) describes the pair. Its first line names
both sides with their GPU count, server layout and lossy optimizations, and tags the side
from `?unofficialrun=` as the unofficial run, with its `overlayRunColor` dot; against its own
GPU's official lead, the readout names that lead "B200 official". Under it, a pale panel holds
one row of cells split by vertical dividers, with values in mono. The reference pair follows
the board's order: the clip's PSNR against the reference (the sealed pair), the subject's wall
time for this prompt (that request's duration), one "$ per clip" cell, then the cell's mean
energy per valid clip. "$ per clip" is modeled TCO on the participating GPUs, the chart's basis,
with its $/video-s under it; its tooltip gives the allocated basis per clip and per video-s.
Against another GPU, a speed cell leads the same four, and each cell adds that GPU's
value; the readout never forms a cross-GPU quality score. Speed is the ratio of the two cells'
p50, the deployment median the chart plots, written "N× faster" or "N× slower". It never
divides one prompt's wall times, so a cell never mixes the two bases. A lossy subject against
its lossless twin leads with a green-tinted "Speed vs lossless" (its value turns green only when
the lossy config is faster), then one "Paired scores: Planned" cell standing for PSNR, SSIM and
LPIPS against lossless, which no scorer computes yet, then PSNR against the reference, cost and
energy. The reference pair stays PSNR-only; SSIM and LPIPS are planned only against the lossless
twin. Without a lossless twin, speed, the paired scores and the twin's line under every other
cell read "—", since no value will follow; speed also reads "—" when either p50 is missing. Any
other value that was not measured reads "Not measured yet", never a placeholder number, and the
matched-noise rerun shows only its PSNR. Every pair fits one row from 1024 px; below that the
cells take 2 columns. How we score quality follows it as its own disclosure. A side
without published media shows its reason (no matched clip,
unpublished run, no sealed reference pair) in place of the video, and a clip that
fails to play offers Retry. The reference's recorded update/sigma-point counts, Diffusers
revision and media link sit in Prompt & sources with the subject's run, artifact,
runtime and media source. The Difference label identifies the amplified browser
preview; its help carries the full qualification.

## Per-clip quality

Per-clip quality is independent of the original candidate ZIP. It comes from the trusted
`h3-quality-<run>-<attempt>` artifact described in [Video History](./video-history.md).
The attachment binds run, artifact, source, manifest, cell, slot, case, prompt, seed, media
path and SHA256. Model, generation and fairness must match the public reference descriptor,
and the reference is the descriptor case with the same prompt, seed and case settings. Both
full-plan hashes are retained when an unrelated case changed. A clip the scorer did not
compare shows its reason (invalid clip, checksum mismatch, no reference or settings differ) in
place of PSNR. A named run that is not published shows PSNR and these reasons without media,
and marks every clip of an artifact the scorer could not read. Publication does not store that
unreadable state, so a later successful score can still attach.

`evaluator.media.compare_media` compares every decoded RGB24 pixel/frame using
full-stream MSE and peak=1 after division by 255, without resizing, trimming or
best-offset alignment. Finite PSNR is shown in dB; exact decoded equality is labelled
separately with null PSNR. Missing and incompatible pairs stay empty. These are
descriptive cross-engine measurements, with no quality threshold or release claim.
The reference uses its recorded Diffusers revision and schedule; the current protocol
has 49 updates / 50 sigma points.

The UI and overview JSON share the same exact per-clip association. JSON returns
all groups under `clipQuality`, so case navigation changes presentation only.
The deployment detail's Validity tab links to these per-clip scores. Cell-granularity CSV has no
per-clip PSNR aggregate. Official and exact named channels retain their approval rules.

中文：质量附件独立于原始候选 ZIP，来自 [Video History](./video-history.md) 所述的可信 `h3-quality-<run>-<attempt>` 产物，精确绑定运行、产物、来源、manifest、测量单元、slot、用例、prompt、seed、媒体路径与 SHA256。模型、生成配置和公平性配置必须与公开参考描述文件一致，参考视频是描述文件中 prompt、seed 和用例配置都一致的用例；其他用例发生变化时仍保留双方完整计划哈希。评分器未比较的视频在 PSNR 位置显示原因（无效视频、校验和不符、无参考视频或配置不一致）。未发布的指定运行显示 PSNR 和上述原因，但不显示视频；评分器无法读取的产物，其中每条视频都会标明。发布时不存储这种无法读取的状态，因此之后评分成功时仍可附加。PSNR 对比全部解码 RGB24 像素和帧；完全一致单独标注，缺失或不兼容配对保持为空。该数值不代表语义质量或发布合格。JSON 返回全部用例组，CSV 不虚构逐条 PSNR 汇总值，发布批准规则不变。

The local replay can also attach a separately sealed matched-noise diagnostic.
The prompt filmstrip puts this labelled rerun first while retaining every
original CI case. Its videos, reference and PSNR use new native receipt/media
identities. Prompt & sources shows those native identities, not the original CI
run as the producer. The diagnostic leaves latency, energy and cost empty; the
performance dashboard continues to show the original cohort.

Overview JSON marks groups with `scope: ci | matched-noise-diagnostic`. Diagnostic
groups have null `take`, `pointId` and `slotId`; `contextPointId` and quality `origin`
identify the original CI context without assigning its measurements to the rerun.
The same shared grouping supplies the UI and API, including hidden/dismissed
overlays. No new URL selector is needed because the API returns every group.
Captured-noise and topology agreement describe the retained execution receipts,
not a calibrated quality verdict or proof of a hardware-only effect.

中文：本地回放还可加载独立封存的相同初始噪声诊断。Prompt 列表优先展示明确标注的重跑选项，同时保留全部原 CI 用例。新视频、参考和 PSNR 使用各自的 native 回执与媒体身份；来源面板显示实际 native 运行。诊断视频不沿用原 CI 的延迟、能耗或成本，下方性能图表仍展示原样本组。overview JSON 用 scope 区分 CI 与诊断；诊断的 take、pointId 和 slotId 为 null，contextPointId 与 origin 仅记录原 CI 上下文。UI 与 API 共用分组和叠加筛选，API 返回全部组，因此无需新增 URL 参数。噪声与拓扑记录一致不代表质量合格，也不能单独证明硬件效应。

## How we score quality

A full-width bordered disclosure below the readout (`QualityMethod.tsx`), collapsed by
default, explains how quality is measured. It states today's method: each clip's PSNR
against the official Diffusers reference, over every decoded frame of the same prompt and
seed. An HTML/CSS diagram across the panel shows the paired lossless method, marked
"Planned", because no scorer computes paired SSIM or LPIPS yet: GPU, engine, server layout,
prompt and seed held fixed; a lossless and a lossy run; PSNR, SSIM and LPIPS over every
decoded frame; the median and the worst clip over the scored prompts (up to 20). A note box
says the plan also runs the lossless config twice, and the gap between those runs would be
the noise floor. A callout with a left rule asks "Why not score against the official
reference?". Once the visible leads' clips load, it gives their live range.
`referencePsnrRange` (`quality-method.ts`) takes the finite PSNR of lossless CI clips and
skips lossy leads, the matched-noise rerun, and identical, incompatible and unscored pairs;
one clip, or equal scores, read as a single value. Until one clip counts, the callout has no
numbers; no range is hard-coded. It then gives the reason in the readout's words, from one
shared sentence (`PIXELS_DIFFER` in `VideoClipReadout.tsx`): different engines and parallel
layouts produce different pixels from the same prompt and seed. Show me (`showMeTarget`)
plays the B200 lead against its reference in Wipe and reveals the stage as Compare below
does (`showOnStage` in `VideoDashboard.tsx`). When B200 is hidden, lossy or has
no playable reference, it plays the first visible lead that has one; without one the button
is absent. With `?unofficialrun=`, Show me tries the named run's leads first, whatever their
hardware, as the stage does. Full methodology opens the quality guide at `/vgx/quality` (`/zh/vgx/quality` from `/zh`) in the
same tab; see [VideoGenX quality guide](./videogenx-quality-guide.md). Events:
`video_results_quality_method_opened`, `video_results_quality_show_me`,
`video_results_quality_methodology_clicked` and `video_results_lossy_see_changes`.

中文：读数区下方有一个通栏、带边框、默认收起的“质量评分方法”说明（`QualityMethod.tsx`）。它先说明目前的方法：每条视频与官方 Diffusers 参考视频比较 PSNR，使用相同的 prompt 和 seed，逐帧比较全部解码画面。横跨面板的 HTML/CSS 示意图展示标为“计划中”的无损配对方法，因为目前还没有评分器计算配对的 SSIM 或 LPIPS：GPU、引擎、服务器布局、prompt 和 seed 保持不变；分别进行无损运行和有损运行；对全部解码帧计算 PSNR、SSIM 和 LPIPS；报告已评分的 prompt（最多 20 条）中的中位数和最差一条。一个灰底提示框说明，按计划无损配置还会再运行一次，两次运行之间的差距即为本底噪声。左侧带竖线的提示块提出“为什么不以官方参考视频为基准评分？”。可见代表部署的视频加载后，它先给出实时的 PSNR 范围：`referencePsnrRange`（`quality-method.ts`）只取无损 CI 视频的有限 PSNR，跳过有损代表部署、相同初始噪声重跑，以及完全一致、不兼容和未评分的配对；只有一条视频或分数相同时显示单个数值。还没有可计入的视频时，提示块不带数字，范围也从不写死。随后用读数区的同一句话（`VideoClipReadout.tsx` 中的 `PIXELS_DIFFER`）说明原因：不同引擎或并行配置即使使用相同的 prompt 和 seed，生成的像素也会不同。“播放示例”（`showMeTarget`）以卷帘视图播放 B200 代表部署与其参考视频，并像“在下方对比”一样把对比区滚入视野（`VideoDashboard.tsx` 中的 `showOnStage`）；B200 被隐藏、为有损配置或没有可播放的参考视频时，改为播放第一个有参考视频的可见代表部署，都没有时不显示该按钮。使用 `?unofficialrun=` 时，与对比区一致，先尝试指定运行的代表部署，无论其硬件是什么。“完整方法说明”在当前标签页打开质量指南 `/vgx/quality`（`/zh` 页面打开 `/zh/vgx/quality`），详见 [VideoGenX 质量指南](./videogenx-quality-guide.md)。事件为 `video_results_quality_method_opened`、`video_results_quality_show_me`、`video_results_quality_methodology_clicked` 和 `video_results_lossy_see_changes`。

## Cost and profit

Both bases are kept as evidence: participating boards and allocated boards. The chart
uses participating boards; the clip stage and
the deployment detail show both. Video-seconds per $1 TCO is the reciprocal of
cost per video-second. Videos per GPU-hour = valid clips × 3600 / (wall seconds ×
the participating GPU count). An
allocation must be evidenced; participating count is never substituted for it.
TCO per video = recorded GPU count × registry $/GPU-hour / measured clips/hour.
Cost per video-second = hourly GPU cost / `videoSecondsPerHour`, the validated
decoded output seconds per measurement wall hour. This rate includes only valid
measured requests and excludes warmup. Requested plan duration remains workload
and filter metadata: a 5-second request can produce 124 frames at 24 fps, or
5.1667 decoded seconds. Owning and rental tiers reuse `hardware.ts` and the shared
hardware registry. These are modelled costs, not measurements or API bills.

The estimator begins with empty price inputs. Each T2V/I2V/R2V price is a user
scenario for the selected resolution and duration. Unknown mode yields no assumed
mode price. Revenue/hour = validated decoded video-seconds/hour × utilization × entered price;
profit/hour subtracts the entire hourly GPU TCO for that basis. Both are normalized
by the corresponding GPU count for the plotted profit/GPU-hour. Utilization
reduces revenue, not the hours billed. Missing output duration for any valid
measured request, or a legacy History projection without `videoSecondsPerHour`,
leaves video-second throughput, per-video-second cost, revenue and profit null;
requested duration is never a fallback. Per-video costs can remain available.
This does not establish sustained capacity.

## Control coverage

Both language routes stream in two parts. The document carries the page shell,
with the controls for the URL-selected state and a loading status. The shell is
`inert` (visible but not operable), because the dashboard remounts in its place and
would drop edits made there. The
dashboard with the complete bounded History cohort and exact selected clip
metadata replaces it once the server reads finish; the browser does not read
History on its own while that is pending. Without video storage, or when the History
read came back incomplete (`X-VideoGenX-Incomplete: 1`, see
[Video History](./video-history.md#publication-and-discovery)), the server seeds
nothing and the browser reads History as before. Hydration reuses successful and
known-missing reads; failures retain the existing retry path. Later media sources
appear independently without clearing matching clips. Videos request no media
before the first Play (`preload="none"`, see Synchronized clips). Derived posters are
allowed only when bound to a receipt: the renditions job writes the first decoded frame of
the sealed original with a receipt keyed by its SHA256 (see
[Video History](./video-history.md#web-playback-renditions)), and they load as images.
`url`, PSNR and Difference stay on the sealed original MP4. The server reads come from the shared tagged cache described in
[Video History](./video-history.md#publication-and-discovery), so only the first
read after a publication waits on storage. This is a presentation-only loading
change: the read-only API selectors, defaults, calculations and
official/unofficial source membership remain unchanged.

中文：中英文页面分两段流式输出：文档先带出页面骨架，即 URL 所选状态的控件和加载提示。骨架设为 `inert`（可见但不可操作），因为仪表板会在原处重新挂载，在骨架中所做的修改会丢失；
服务端读取完成后，再以带有完整有界 History 数据和所选视频元数据的仪表板替换它，
等待期间浏览器不会自行读取 History；未配置视频存储，或 History 读取结果不完整（带 `X-VideoGenX-Incomplete: 1`，见 [Video History](./video-history.md#publication-and-discovery)）时，服务端不预填数据，仍由浏览器读取 History。hydration 复用成功读取和已确认缺失的结果；失败仍可重试。
后续媒体源独立显示，不会先清空仍匹配的视频。首次播放前视频不请求任何媒体（`preload="none"`，详见 Synchronized clips 一节）。
只允许绑定回执的派生封面：转码 job 截取封存原始视频解码后的第一帧，并写入按其 SHA256 记录的回执
（见 [Video History](./video-history.md#web-playback-renditions)），封面作为图片加载。`url`、PSNR 和“差异”视图仍使用封存的原始 MP4。服务端读取来自 [Video History](./video-history.md#publication-and-discovery)
中描述的共享标签缓存，只有发布后的首次读取需要等待存储。这只是加载方式的调整，
不改变只读 API 的选择项、默认值、计算或正式／指定运行的来源归属。

| Control                                                                                 | Read-only API coverage                                                                                         |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Model, workload, resolution, duration, mode, steps, engine, date                        | `r_*` selection fields                                                                                         |
| Hardware visibility, named run (stored or read live)                                    | `r_hidden`, `unofficialrun`, separate overlay cells preserving approval                                        |
| Deadline, cost tier, mode prices, utilization                                           | Same pure calculations in `resultProjection`                                                                   |
| X and Y metrics, Optimal only, open deployment                                          | `r_x`, `r_y`, `r_optimal`, `r_point`; every axis value is in each cell                                         |
| Engine comparison, Lossy optimizations                                                  | `r_lossy` (`r_compare` is retired and ignored); presentation only, every cell carries `metadata.optimizations` |
| Fixed GPU basis, all GPU counts                                                         | `r_basis`, `r_gpus` accepted but ignored; resolved params are participating and null                           |
| Advanced disclosure                                                                     | Presentation only; closed by default, preserves scenario inputs                                                |
| Deployment labels, detail tab, pinned point                                             | Presentation only                                                                                              |
| Clip transport, audio source, Difference, case navigation, History expand, theme, Share | Presentation only; published media metadata uses the existing read-only media contract                         |
| Clip subject and its pair                                                               | Presentation only; `r_clip` is page state                                                                      |
| How we score quality, Show me, See what changes                                         | Presentation only; the PSNR range comes from the existing published media reads                                |
| Cohort help, prompt/source and hash disclosures, media link                             | Presentation only; existing history and published media reads provide their data                               |

Admin/publication handlers, private artifacts and credentials are excluded.
Video results controls and the new disclosures/media link record `video_results_*`
events. Shared `InfoHelp` retains its `selector_option_help_opened` event. Tests cover projection/API parity, both GPU bases,
nulls and invalid power, sample floors, overlay filtering, chart series for official
and overlay runs, legend filtering, deployment detail history, clip alignment, real
browser playback and difference failure, bilingual layout and 390px overflow.

## 中文说明

`/vgx` 与 `/zh/vgx` 共用结果页，沿用现有路由、功能开关、History 和封存媒体读取器。
未记录服务端布局（TP、Ulysses）的早期数据点无法与同一 GPU 数量下已记录布局的数据点区分，因此会被同一硬件、GPU 数量和并发数下更新的数据点取代；通过运行信息选择更早的运行时仍会显示。
比较要求固定的 20 条视频 C1 工作负载，每种硬件至少 10 个有效样本；完整身份包含模型版本、
生成参数、prompt、seed 和测量语义。较短 smoke、未完成及未匹配结果留在性能历史，不混入比较。
历史记录保留尚无发布批准的存储结果；默认图表仅接纳发布回执与原始来源及 checkout 匹配的记录。
发布批准与 full-sweep 或发布资格验收分开。
页面沿用推理与 AgentX 的两级布局。概览页首将筛选分为基准测试配置（模型、工作负载、引擎）、图表配置（X 与 Y 指标）、对比历史趋势和运行信息。对比历史趋势中的芯片配置最多可选 4 个部署，并可限定日期范围；图表随即按时间顺序绘制各部署的每次运行并标注运行日期，指定的叠加运行中匹配的部署单独成一组，表格、视频和成本说明仍按所选运行显示。运行信息沿用推理页的运行日期和运行选择器：每个正式部署显示其在所选运行或之前的最新运行，运行链接打开对应的 GitHub Actions 运行。图表绘制所选工作负载的全部实测部署：X 轴可选单条视频延迟或每个部署的 GPU 数（见 X-axis metric 一节），所有部署生成的视频时长和帧率相同时，延迟坐标轴的标题会注明这两项；
Y 轴可选每 1 美元 TCO 生成的视频秒数（默认）、每 GPU 小时生成视频数或每条有效视频的 GPU 能耗；每种硬件及每个叠加运行
各自绘制 Pareto 前沿。右侧图例可隐藏硬件，没有匹配运行的硬件显示为灰色，并提供部署标签开关和“重置筛选”。图表卡片使用 `ChartSection`，带有共享的图表按钮（PNG 导出、overview API `format=csv` 的 CSV、图例开关和缩放重置），图表标题放在图表说明中，导出的 PNG 也会带上标题。图表下方的 `ResultContext` 页脚与推理页一致，可切换成本层级，并标明固定使用的参与计算 GPU 口径，同时列出更新时间、来源、各硬件 TCO $/chip/hr 价格表（`TcoPriceTable`）及价格来源链接。
每种硬件、runtime 和运行通道各为一组，各自计算 Pareto 前沿。默认每种硬件只绘制一条无损曲线，即前沿面积最大的一条（`frontierArea`，与推理页每个 SKU 选最优曲线的 hypervolume 规则相同），指定运行单独评选。数据中有两个引擎时，图表配置里的引擎选择器可选「最优」（默认）或单个引擎；曾用于绘制全部引擎的 `r_compare` 仍可传入，但会被忽略。`optimizations.ts` 判定声明的优化项是否有损，未登记的优化项按有损处理；有损曲线不参与评选，存在时图例中的「有损优化」开关可以把它们以虚线加入，并在图例下方列出，例如 “H100 (NVIDIA Sol Engine · Sol-Attn + FirstBlockCache)”。每条有损曲线都会带上它的无损对照曲线，即使该引擎不是「最优」：`losslessTwin`（`deployment.ts`）只把有损数据点与同一运行、硬件、引擎、GPU 数量和服务器布局的无损数据点配对，并优先选择相同并发数。无损对照曲线只用于对比，不会作为硬件的代表出现在卡片或视频中。有损曲线下方的说明指出，有损配置以部分画质换取速度，以各配置自身无损运行为基准的评分尚在计划中；其中的“查看画面变化”（`seeChangesPair`，`quality-method.ts`）以卷帘视图播放一个已绘制的有损数据点及其无损对照，并像“在下方对比”一样把对比区滚入视野。指定运行的有损数据点优先，且只与同一运行配对；其次按 B200 和名单顺序，取各硬件的有损代表部署。两个数据点都可能有视频时才显示该操作。目前生产数据没有有损测量单元，因此这部分用 fixture 验证。任何操作第一次让同一 GPU 出现两个引擎时，先弹出共享的引擎对比确认框，此后才按引擎区分点形。图例写明每张 GPU 的无损引擎，例如 “H100 (SGLang)”。有损部署不会作为硬件的代表出现在卡片、视频或证据对比中。悬停数据点时显示共享的精简悬停卡片（`chartHoverCard`）：硬件与引擎、两个坐标轴的数值、GPU、部署和并发数。已存储数据点的卡片顶部显示它在当前 prompt 下的封面。对比区尚未读取该数据点的视频时，卡片先保留封面的位置，并像 `Skeleton` 一样闪动；指针在该数据点上停留 250 ms 后，发起与点击相同的读取，读取完成后封面填入该位置，若该数据点没有封面或读取失败，则收起这一位置；点击该数据点会重新读取。停留到其他数据点上会中止这次读取，它也不计入对比区的加载状态。实时读取的指定运行数据点没有媒体，卡片只显示文字。点击后打开共享的数据点详情面板（`ChartPointDetails`）：日期、两个坐标轴的数值，随后先列能耗、功率和功率上限，再列并发数、参与和分配的 GPU、有效视频数、部署、不在 X 轴上的各项延迟、成本和 Runtime；非官方运行的数据点在两处都会标出运行编号。GitHub Actions 运行链接和“查看遥测”位于面板固定的操作行，无需滚动即可看到；点击“查看遥测”进入部署详情（`r_point`）。同一次点击还会在下方对比区播放该部署的视频（`r_clip`），面板中的“在下方对比”会等对比区所需的视频读取全部完成后，再用 `scrollIntoView({ block: 'nearest' })` 把对比区及其播放控件滚入视野，并让焦点落在对比区上，这样随读取结果出现的 prompt 行不会把对比区挤出视野；仅点击数据点不会滚动页面。只有已存储的数据点（有 `publishedAt`）可能有视频：实时读取的指定运行的数据点画成空心，点击只固定其详情；已存储但没有视频的数据点仍由对比区显示空状态。对比区两侧播放的数据点分别标有“播放中”和“基线”。在读者第一次选择视频之前（点击数据点、“对比”一行、“在下方对比”或“查看画面变化”），其余已存储的数据点会以系列颜色向外扩散的圆环闪动；开启 `prefers-reduced-motion` 时圆环保持静止。圆环位于数据点内部，悬停和缩放引起的重绘不会让它重新开始，PNG 导出也不包含它。数据点和曲线切换到新数据时，与推理页散点图一样用 300 ms 平滑移动；开启 `prefers-reduced-motion` 时直接跳到新位置。移动过程中每一帧都会重绘标记、系列标签和数据点标签，使它们始终贴着数据点。样本组加载时，绘图区显示 `Skeleton`，而不是选择为空时的提示；加载状态只向屏幕阅读器播报。图上已有数据点时重新加载，图表卡片以 `motion-stale` 变暗。这些标记和空心点由自定义图层绘制，它从 ref 读取选择并通过 `D3ChartHandle` 重绘；选择不会进入图表的数据、图层、悬停配置或坐标轴配置，因为其中任何一项变化都会重建图表，并关闭刚刚固定的详情面板。同一图层在每条曲线最后一个前沿点旁绘制系列标签，颜色与曲线一致，文字与图例相同（如“B200 (SGLang)”；有损曲线为虚线描边，指定叠加运行使用 `overlayRunColor`）。系列标签会避开已显示的数据点标签（向右让开或移到其下方），彼此会重叠的每次下移 21 px，并始终留在绘图区内，跟随缩放和平移，也会出现在 PNG 导出中。绘图区窄于 480 px 时，叠加运行只为焦点曲线绘制系列标签，避免手机画面被非官方标签覆盖。开启部署标签时，GPU 数标签只显示在焦点系列上，即播放中、基线和悬停的系列；靠近边缘的标签会移回绘图区内，会与其他标签重叠的则不显示。曲线、数据点、图例、系列标签以及对比区、“对比”一行和读数中的色点使用 VideoGenX 专用配色（`hardware-colors.ts`），每种 GPU 各有浅色和深色主题取值，H100 与 H200 不再共用站点的 NVIDIA 绿色；其他仪表板保持原有配色。详情页页首使用 `DashboardSectionHeader` 并带分享按钮。详情入口在 `history.state` 中做标记，
刷新或前进后页内返回仍会弹出该条目，浏览器后退也会回到原滚动位置；概览在后台保持挂载，视频、已加载的性能历史和图表状态不会丢失。
详情页分为遥测、有效性、来源三个标签页。未知、已筛除或已隐藏的 `r_point` 回到概览，结果加载后会从 URL 中移除，重新显示该硬件或分享时不会再打开它。“如何解读这些结果”始终展开；利润估算器位于默认收起的“高级选项”中，其各模式价格和利用率放在“场景”控制面板中；性能历史需要读取已存储的 History 页面，因此默认折叠在带箭头的标题下，深链接时自动展开。尚未采集的指标在“如何解读”中列出，
不使用占位图表或示意数值。功率无效时不展示功率或能耗结论。

视频对比只读取已存储产物，核对 prompt、seed、重复次数和生成配置后同步播放。视频区接在图表卡片的分隔线下方，在与卡片同宽的双侧对比区（`VideoClipStage`）中播放：左侧为配对视频（基线），右侧为对比对象。画面高度不超过窗口高度减去 18rem，窗口较矮时对比区和播放控件一起收窄并居中，使“对比”一行、画面、播放控件和读数区一起留在页首下方的视野内；并排视图按两个画面的宽度计算这一上限。`r_clip` 指向的数据点若在图表中绘制，就以它为对比对象；否则通过 `?unofficialrun=` 指定的运行若有可见数据点，无论是否有视频，都以它为对比对象；否则默认对比对象为 B200 的起始部署（`stageOpenings`）：B200 代表部署所在前沿上延迟处于下中位的数据点。这样对比区从曲线中段开始（在 1、2、4、8 张 GPU 中为 4 张），而不是从卡片和对比所用的最高效一端，或成本最高的最快一端开始。B200 被隐藏或没有已发布视频时，改用名单中第一个有视频且未隐藏的硬件，并按同样规则选择部署。服务端会连同各代表部署一起预取起始部署的视频。优先的硬件仍在加载时会先占住位置，加载完成后画面不会跳到别的硬件。切换到视频尚未读取的一组对比时（点击数据点、“对比”一行或“在下方对比”），对比区和读数区先保留上一组，并像推理页图表重新获取数据时那样以 `motion-stale` 变暗，读取完成后再切换；图表标记和“对比”一行会立即跟随新的选择，prompt 行也保留原有卡片。新一组的首帧加载完成前（最长 800 ms），对比区同样保留上一组但不变暗，因此切换对比或 prompt 时画面不会先变黑。第一组读取完成前，prompt 行和对比区以 `Skeleton` 占位。加载状态只向屏幕阅读器播报。“对比”一行写作“[配置] 对比 [配对]”，由两个与站内样式一致的下拉框组成。第一个选择播放的对象：每种可见硬件的起始部署；开启有损曲线时，再加上每个已绘制的有损配置，取其延迟处于下中位的部署（`compareConfigs`）。选择后与点击图表一样写入 `r_clip`。第二个自动跟随（`defaultPairing`）：有损配置配其无损对照，来自 `?unofficialrun=` 的对象配同一 GPU 上部署相同的官方数据点，没有时配该 GPU 的官方起始部署（`officialCounterpart`），其余对象配各自已封存的 Diffusers 参考；也可以改选其他每种可见硬件的起始部署，即第一个下拉框为该硬件播放的部署。配对一侧播放与对象相同 prompt、seed 和重复次数的视频；找不到无损对照时，画面位置会说明原因。这一选择是由 `VideoDashboard` 持有、不写入 URL 的页面状态，因此图例中的“查看画面变化”可以选中无损对照；通过该行或图表换成新对象时，配对回到默认；对象没有所选项时显示参考。每侧左上或右上的标签注明硬件与引擎，随后是 GPU 数量（有损一侧另注优化项，无损对照注明“无损”），或注明参考并标为“官方”，并带有扬声器按钮；`?unofficialrun=` 叠加运行使用 `overlayRunColor`，并标注“非官方运行”。“Prompt 与来源”列出画面中的两侧。
对比区有四种视图：卷帘（默认）、并排、切换和差异。卷帘视图把两侧叠放，右侧画面从跟随指针移动的分界线处裁切；点击画面或分界线按钮可锁定，焦点在按钮上时可用 `←`/`→` 移动分界线。并排把两段视频左右排列，宽度小于 640px 时改为上下排列。切换一次只显示一侧：点击画面或按 `T` 切换，按住空格键可临时查看另一侧，松开后复原；在其他视图中，焦点位于对比区时按空格键播放或暂停。快捷键只作用于获得焦点的对比区，不监听整个页面；对比区内按钮上的空格键和回车键仍触发按钮本身。宽度不小于 820px 时，prompt 列表、当前 prompt 和视图切换器排在同一行；更窄时，列表和 prompt 各占一整行。prompt 是这一行的主体：14px 正文色文字，最多显示两行，超出时提供“展开”链接，前面是等宽半粗体的 `seed N`。只有另一个已加载的重复与它的 prompt 和 seed 相同时，开头和卡片上才显示“第 N 次”，因此生产数据中只有一次重复的 prompt 只显示 seed。列表显示放得下的卡片，最多三张，另加当前 prompt 的卡片，以及一个展开全部的“+N”卡片。每张卡片是 prompt 的封面加用例 ID：优先使用该 prompt 参考视频的封面，其次使用对比对象视频的封面；两者都没有或图片加载失败时，显示写有用例 ID 和 seed 的文字卡片。封面按固定尺寸延迟加载，加载完成后在闪动的占位上淡入（`motion-media`）。鼠标停留在封面卡片上或用键盘聚焦该卡片时，会在封面上循环播放该视频的静音网页版本，开始播放后淡入；只有这时才请求该版本。触摸只会选择 prompt，开启 `prefers-reduced-motion` 时保持静止封面。`clip-stage.ts` 负责对比区自己的 URL 参数：`r_prompt`（用例 ID，第二次及之后的重复加 `~take`，相同初始噪声重跑加 `diag:` 前缀）、`r_view`（卷帘视图时省略）和 `r_clip`（对比对象的 `resultsPointKey`）。它只改写这几个参数，仪表板的 `commit` 改写结果参数时也会保留它们。这些参数只是页面状态：overview API 请求由结果参数构成，不会携带它们。未知的 prompt 显示第一条；未知、已隐藏或未绘制的 `r_clip` 播放默认对象；两者都仍留在 URL 中。切换 prompt、对比对象或配对视频会暂停并把两侧都回到开头，视图、分界线锁定和音源保持不变。
卷帘、并排和切换视图优先播放 `previewUrl` 指向的网页转码版本，没有转码版本或转码版本加载失败时播放封存的原始视频；“差异”视图两侧都加载原始视频，PSNR 和视频文件链接始终使用原始视频。播放转码版本时，“Prompt 与来源”中会注明。首次点击播放前不请求任何视频媒体：视频以 `preload="none"` 渲染，并显示各自一侧的封面。两侧都有封面时，卷帘分界线在播放前即可使用；否则由待播放画面（prompt、两侧标签和播放按钮）覆盖对比区。首次播放时在点击手势内改为 `preload="auto"` 再预热。浏览器只把 `preload` 视为提示，因此这只是尽力而为。
同步播放由 `clip-sync.ts` 中的纯函数状态机驱动（暂停、加载、缓冲、播放、结束五个状态），`useClipGroup` 只负责采集每个视频的快照并执行返回的动作，`?unofficialrun=` 叠加视频走同一套逻辑。首次播放后每段视频完整下载；视频只有几秒长，因此先下载完整再播放，播放过程中不会卡顿。只要还有视频没有从当前时间缓冲到共享结尾（允许 50 毫秒误差）或 `readyState` 低于 3，控制条就显示“加载中 N%”（以最慢视频已缓冲的共享时长百分比计）。此时点击播放会进入加载状态，等全部视频加载完成后一起开始；拖动进度条和结束后重播同样经过加载状态。播放过程中若有视频停顿（未在 seek 且 `readyState` 低于 3，例如浏览器回收了缓冲），全部视频一起暂停并显示“缓冲中 N%”，等每个视频都至少缓冲了 1 秒后续数据或缓冲到结尾后，再从主视频的时间点一起恢复。开启音频时以有声视频为主，否则以第一个未停顿的视频为主；有声视频不会被 seek 去追赶其他视频。40 到 250 毫秒的偏差通过微调 playbackRate 纠正，超过 250 毫秒才 seek 一次，且该视频 seek 过程中不会重复触发。时间显示和进度条每秒最多刷新十次。
对比区下方的控制条包含播放、进度条、时间、“互换两侧”和“检查”。互换两侧只交换两侧在画面中的位置：卷帘视图交换左右，并排视图交换左右（窄屏上下排列时交换上下），切换视图交换按钮顺序。对比对象与配对视频的角色不变：对比区的无障碍标签仍为“对比对象 对比 配对视频”，下方指标仍属于对比对象。“检查”展开逐帧、播放速度、缩放和循环播放控件，这些状态只保存在对比区本地，切换 prompt 或对比对象时保留。逐帧会暂停两侧视频，并把它们 seek 到上一帧或下一帧的中点，即使浏览器对 seek 时间取整，也会显示目标帧；焦点位于对比区时按 `←`/`→` 效果相同。帧率取自工作负载记录的 `plan.generation.fps`（`resultMetadata`），总帧数取自其 `frame_count`，且不超过可播放时长对应的帧数；缺少帧率时逐帧按钮不可用。播放速度（0.25×、0.5×、1×）是整组视频的基准 `playbackRate`：偏差微调不超过该速度的 10%，恢复播放、拖动进度条和重新加载视频源后都回到该速度，而不是回到 1×。缩放（1×、2×、4×）对两侧视频和差异画布施加同一个 CSS 变换；放大后拖动画面会同时平移两侧，按 `Esc` 恢复原始大小并解除分界线锁定。循环播放默认开启：到达共享结尾时两侧一起 seek 回 0，再经过加载状态同时重新开始，不会出现一侧单独循环；关闭后视频停在共享结尾。每个控件都会记录 `video_results_` 前缀的事件。
默认静音。点击任一可播放一侧的扬声器按钮即只播放这一侧的声音，参考视频也可以；再次点击恢复静音。切换 prompt 时保留当前音源，隐藏音源或音源播放失败后恢复静音。从部署详情返回总览时，负责 `muted` 的 layout effect 会重新应用音源选择，因为 React 不会重新设置没有变化的 prop。音源选择只影响本地播放，不改变媒体、指标、URL 参数或只读 API 返回内容。
“差异”视图是两侧视频在相同播放时刻（相差不超过 0.12 秒）的浏览器 RGB 差异预览，配对视频是明确绑定的官方 Diffusers 参考，与封存的全帧 PSNR 测量分别展示。不能根据硬件型号或步数推断参考身份。
任一侧没有可播放的视频时显示“两侧都需要有视频”；帧尺寸不一致或无法跨域读取像素时显示不可用。Blob 媒体返回 `access-control-allow-origin: *`，所有视频都设置了 `crossOrigin="anonymous"`。蒸馏与完整步数分组保留。
对比区下方的读数区（`VideoClipReadout`）说明当前这一对视频。第一行列出两侧的名称、GPU 数量、服务器布局和有损优化项，并把来自 `?unofficialrun=` 的一侧标为非官方运行，色点使用 `overlayRunColor`；与同一 GPU 的官方代表部署对比时，读数区把后者称为“B200 官方运行”。其下是一块浅色面板，各格排成一行、以竖线分隔，数值使用等宽字体。与参考对比时按设计稿的顺序显示：该视频相对参考的 PSNR（已封存配对）、对比对象在当前 prompt 下的出片时间（该请求的时长）、一格“每条视频成本”，以及所选测量单元每条有效视频的平均能耗。“每条视频成本”按参与 GPU 估算 TCO，与图表口径一致，下方附每视频秒成本；按分配 GPU 估算的每条视频成本和每视频秒成本放在该格的悬停提示中。与其他 GPU 对比时，速度一格排在最前，其余四格各附上该 GPU 一侧的数值；读数区不构造跨 GPU 的质量分。速度是两个测量单元 p50 之比，即图表所画的部署中位数，写作“加速 N×”或“耗时为其 N 倍”。速度不用单个 prompt 的出片时间计算，因此同一格内不会混用两种口径。有损对象与其无损对照对比时，先显示带浅绿底色的“速度（相对无损对照）”（只有有损配置更快时数值才显示为绿色），随后一格“配对评分：计划中”代表相对无损对照的 PSNR、SSIM 和 LPIPS，目前还没有评分器计算；之后是相对参考的 PSNR、成本和能耗。与参考对比时只显示 PSNR；SSIM 和 LPIPS 只计划在与无损对照配对时计算。没有无损对照时，速度、配对评分以及其余各格下方无损对照的那一行都显示“—”，因为之后也不会有数值；任一侧缺少 p50 时，速度同样显示“—”。其他未测量的值显示“尚未测量”，不用占位数字代替；相同初始噪声重跑只显示其 PSNR。在 1024px 及以上，每种对比都排成一行；以下为 2 列。读数区下方是单独的“质量评分方法”折叠说明。没有已发布媒体的一侧在画面位置显示原因（没有匹配的视频、未发布的运行、暂无封存的参考配对），无法播放的视频提供“重试”。参考视频记录的更新次数和 sigma 点数、Diffusers 版本及视频文件链接，与对比对象的 prompt、seed、重复次数、
运行、产物、Runtime 和媒体来源一起放在“Prompt 与来源”中。

成本同时按参与计算和分配的 GPU 数量估算，分配证据缺失时不填补；图表固定使用参与计算的 GPU 口径，对比区和部署详情仍同时展示两种口径。代表性部署表，以及 GPU 数量和 GPU 口径选择器，均已移除。界面与 overview API 始终包含全部 GPU 数量；旧链接中的 `r_gpus`、`r_basis` 参数会被忽略。利润估算器位于默认收起的“高级选项”中；展开或收起都不会改变数据和计算结果，已填写的场景输入会保留。视频秒吞吐量、每视频秒成本及收入使用有效测量请求的实际解码视频时长，不包含 warmup；请求时长仅用于工作负载身份与筛选。
任何有效测量请求缺少视频时长，或旧 History 投影没有 `videoSecondsPerHour` 时，上述指标及利润保持为空，不以请求时长代替。每条视频成本仍可在证据充分时计算。利润输入默认空白，属于用户
场景假设；利用率只降低收入，不减少付费时长。模式未知时不套用 T2V/I2V/R2V 价格。
页面与只读 API 以一次请求最多读取五页 History，共用选择和计算逻辑，`r_*` 参数可以分享，其中对比区的 `r_view`、`r_prompt` 和 `r_clip` 只保留在页面 URL 中，不是 API 参数，overview API 会将其视为未知参数而拒绝；`?unofficialrun=` 只读取指定运行。
已存储的运行保留其发布批准状态；不在 History 中的运行，通过 `/api/video-runs?run=<id>&format=live` 从其 GitHub 产物实时读取：
只取每个原生 `h3-results` 配置的最新一次尝试，按显式字节区间读取 JSON 文档，并用 `SHA256SUMS` 和 manifest 身份校验。
这类条目未经批准，没有 `publishedAt`，也不附带媒体，因此视频面板不显示它们，横幅会注明该运行尚未发布。
指定运行单独放入 overlayCells 和 overlayDeploymentCells；选中期间，即使已批准也不进入正式结果、部署或工作负载构成。两者均保留所有匹配的 GPU 数，不再按 GPU 数量筛选。
默认优先选择有已批准结果的工作负载；仅由指定运行提供的工作负载须明确选择，
或在没有匹配的已批准结果时作为回退。
支持隐藏硬件及移除；清除叠加运行后不会将未批准数据转为正式结果。
移除时，工作负载选择仅在已批准选项中仍然有效时保留。overview 默认返回 JSON；`format=csv` 下载当前筛选的正式及指定运行数据点，保留来源、工作负载、运行、产物和批准状态，标明单位及两种 GPU 成本口径。`duration_s` 保留计划请求时长，`video_seconds_per_s` 表示每测量秒生成的有效解码视频秒数。缺失值保留为空单元格，CSV 不缓存。
读取不会启动 GPU、写入 Blob 或发布媒体。测试覆盖 API 一致性、样本门槛、
两种成本口径、缺失证据、图表中的正式与叠加数据点、图例筛选、部署详情历史记录、同步视频与中英文 390px 布局。
