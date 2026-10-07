# Presentation themes

## How Minecraft works

The root `ThemeProvider` in `packages/app/src/app/layout.tsx` uses `next-themes`
to persist a theme and apply its class to `<html>` before hydration. The
header's `ModeToggle` is an icon-only picker: the trigger shows the active
theme's icon and expands a compact column with one icon button per theme in
`APP_THEMES` order, so any theme is one tap away. Selecting a theme emits
`theme_toggled`.
The existing default remains dark; the system setting remains supported.

Minecraft has several independent paths:

- `globals.css`: semantic tokens, global Monocraft typography, square corners,
  beveled controls, pixelated images, and the grass-colored header rule.
  Tailwind's `dark` variant also applies to Minecraft.
- `MinecraftBackgroundLazy`: observes the root class before importing the
  background. That background dynamically imports a React Three Fiber scene
  with 60 floating blocks; it also owns click audio and the YouTube music player.
- `MinecraftDecorations`: separately observes the class, renders corner
  images, and triggers the dragon entrance/growl. Its effect cleans up on exit;
  reduced-motion and the saved sound preference gate the entrance sound.
- `MinecraftToggles`: exposes the saved music/sound settings in the header.
- `MinecraftSplash`: selects a random Minecraft splash, while other themes
  retain the existing AgentX announcement.
- Chart/figure/export code: selects dark-background palettes and figures;
  PNG typography has a separate Minecraft font override.

Consequently, adding only a CSS class would leave charts, article figures,
architecture diagrams, PNG footers, and replay MP4 footers on the wrong
contrast branch.

## CS:GO implementation

`src/lib/themes.ts` centralizes picker order
(`light, dark, minecraft, csgo, gta, kart`), dark-background classification, and the
chart-palette alias used by CS:GO and GTA. CS:GO retains the
existing sans-serif font for chart legibility and preserves the dark theme's
vendor, high-contrast, and overlay palettes. It does not recolor hardware
series into team colors.

`CsgoDecorations` follows the same root-class activation lifecycle without
Three.js, animation, audio, or video. A responsive local Dust II image sits
behind the document with `pointer-events: none` and `aria-hidden`. A separate
theme-only banner identifies CS:GO and Dust II without replacing InferenceX's
branding. Cards remain nearly opaque; controls retain normal cursor behavior
and gain a visible gold keyboard-focus outline. Autumn leaves and circuit
decorations are hidden in CS:GO. Embed routes suppress CS:GO decorations too.

The visual references are Valve's
[Dust II presentation](https://www.counter-strike.net/dust2/) and its
[Panorama announcement](https://blog.counter-strike.net/page/36/?iapolo_com).
Asset provenance and the maintainer-reported permission are recorded in
`packages/app/public/decorative/csgo/README.md`. Permission is not extended to audio.

### CS:GO development-game entry

The English and Chinese landing pages show a native **Play CS:GO** link only
while the CS:GO theme is selected. It navigates in the same tab to
`/games/csgo?lang=en` or `?lang=zh` on InferenceX. The game is a standalone
static page served by the website, not a Perplexity link or an external iframe.
The native link has `nofollow` and no framework prefetch, game-engine import,
or audio initialization. Hovering or focusing it does not request the game.
Other routes retain their existing CS:GO banner.

The launcher lives inside the existing lazy CS:GO theme chunk. The shared
theme subscription returns no optional theme during SSR or on embed routes.
Light/dark/system pages therefore do not mount this entry, while the canonical,
language alternatives, JSON-LD, headings, and benchmark content stay unchanged.
The shared theme picker and subscription still have a small existing cost;
resource-isolation tests are not a guarantee of identical field Web Vitals.

PR #1282 remains draft until its separately documented 95% game-completion
gate passes. This launcher does not qualify game fidelity, bot intelligence,
asset licenses, or production readiness. See [the in-site game architecture](./csgo-game.md)
for the pinned asset build and route isolation.

## GTA implementation

GTA follows the CS:GO pattern: it is dark-classified everywhere
(`isDarkTheme`), aliases onto the dark chart seed (`chartPaletteTheme`), and
keeps the dark vendor, high-contrast, and overlay palettes.

The chrome follows the GTA V pause menu: near-opaque black panels over Rockstar's
Michael/Franklin/Trevor artwork, a black header with a cash-green rule, uppercase Chalet
Comprime menu tabs with the current page as a solid white tab
(`aria-current="page"`), Chalet Comprime headings, and DM Sans body copy.
`GtaThemeBanner` pairs Michael's Vinewood artwork with a stacked Pricedown
"Grand Theft InferenceX" wordmark (live text, not the GTA V logo) and a
five-star wanted level.
The splash uses Pricedown in mission gold. `GtaDecorations` follows the root
class and renders local responsive WebP images (`aria-hidden`,
`pointer-events: none`), only while GTA is active. Embed routes suppress both;
the scene also observes the embed attribute and never mounts its images there.
Dashboard navigation uses white selected tabs with black text.

Fonts are loaded with `next/font/local` and `preload: false`, and are only
referenced under `.gta`, so other themes never request them. Provenance and
the maintainer-reported Rockstar font agreement are recorded in
`packages/app/src/app/fonts/GTA-FONTS.md`. Artwork sources, transformations,
and the separately reported permission are recorded in
`packages/app/public/decorative/gta/README.md`. These assets are not covered
by the repository's code license.

## Playable Minecraft

The Minecraft banner launches an optional, full [playable Minecraft](./minecraft-game.md)
(survival and creative, infinite seeded worlds, crafting, smelting, mobs, local
saves). The game bundle and its assets load only after the launcher is pressed.
Asset provenance is recorded in `packages/app/public/decorative/minecraft/game/README.md`.

## Mario Kart implementation

Mario Kart adds a flag option to the same picker, dark chart-palette aliasing,
local responsive Luigi Circuit artwork, and an opt-in 3D race dialog. The
track and kart bundle loads only after the launcher is pressed. See
[Mario Kart theme and race](./mario-kart.md) for controls, lifecycle, verification,
and the presentation-only API exclusion. Asset provenance and the
maintainer-reported Nintendo permission are recorded in
`packages/app/public/decorative/kart/README.md`.

## Picker accessibility

The GTA banner also launches the optional [Bay Area heist game](./gta-heist.md).
The game loads on demand and does not alter benchmark controls or data.

The trigger keeps `data-testid="theme-toggle"` and its
`Switch theme (currently <theme> mode)` label. Options are `role="radio"` in a
labelled `radiogroup` (`data-testid="theme-option-<theme>"`), with localized
`aria-label`/`title` text, roving tab index, arrow/Home/End navigation, and
Escape to close. Options stay 44px on phones and 36px from `md`.

## Data/API coverage

This is a presentation-only control: no filter, metric, calculation, route,
share parameter, or returned data changes. Under the documented
presentation-control exclusion, no API contract or `packages/skills` change
is required. The shared palette paths apply to official and unofficial data;
the overlay CSS variables inherit the existing dark palette.

## Verification inventory

- Direct selection of every theme from the picker, keyboard navigation,
  persistence after reload, and cleanup on exit.
- No CS:GO image requests on a cold light/dark landing; images load only
  after selection, with a smaller mobile crop.
- No GTA artwork requests on a cold light/dark landing; responsive artwork
  loads on selection, the Pricedown wordmark renders, persist after reload, and unmount on exit.
- CS:GO uses dark figure sources and chart colors, including high-contrast.
  PNG/MP4 footer contrast uses the same shared dark-theme classifier.
- Desktop and narrow mobile landing/chart views, keyboard focus, Chinese
  routes, and reduced-motion preference.
- Existing Minecraft decoration/splash tests, shared header utility geometry,
  and wordmark contrast run alongside the new tests.
