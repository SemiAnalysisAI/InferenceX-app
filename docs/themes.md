# Presentation themes

## How Minecraft works

The root `ThemeProvider` in `packages/app/src/app/layout.tsx` uses `next-themes`
to persist a theme and apply its class to `<html>` before hydration. The
header's `ModeToggle` is an icon-only picker: the trigger shows the active
theme's icon and expands a compact column with one icon button per theme in
`APP_THEMES` order, so any theme is one tap away. Selecting a theme emits
`theme_toggled`.
The existing default remains dark; the system setting remains supported.

The root `EasterEggThemeLazy` boundary imports only the selected optional theme.
Light/dark pages, first-time visits, system-theme visits and embeds do not render
that boundary's content. The shared activation hook checks both the embed
pathname and the pre-paint attribute so a saved optional theme cannot start
loading while a streamed embed is waiting for its boot markup.

Minecraft has several independent paths:

- `globals.css`: the small pre-paint palette and hiding rules. Theme layout CSS
  and font declarations live in the lazy theme module. Tailwind's `dark` variant
  also applies to Minecraft.
- `EasterEggThemeLazy`: observes the root class before importing the selected
  theme. The Minecraft background dynamically imports a React Three Fiber scene
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

`optional-theme-imports.test.ts` follows static runtime imports and re-exports
from all page/layout entry points, including their shared components and CSS.
It rejects eager optional-theme implementations, Three.js/React Three Fiber
and Rapier, and theme asset/font loads in shared CSS. Only the small splash and
toggle wrappers are permitted across that boundary; their transitive imports
are still checked. Dynamic imports are verified separately by browser tests.

`optional-theme-isolation.cy.ts` runs in the existing production-build Chrome
and Firefox CI matrix. It covers:

- English/Chinese desktop/mobile light/dark landings, no saved preference and
  system preference, including opening the picker and scrolling.
- Network requests from navigation onward (including requests still in flight),
  loaded JS/CSS fingerprints for the optional engines and Minecraft game,
  font registration, and absence of optional theme/game DOM.
- English/Chinese embeds with each optional theme saved, before and after
  hydration. Saved music/sound opt-ins must not activate outside Minecraft.
- Raw-HTML metadata and headings for normal and Googlebot requests, preload
  hints, and unchanged SEO metadata when selecting and leaving optional themes.

These checks guard resource isolation and indexable content. They do not
establish zero shared theme-selector overhead, guarantee search rankings, or
replace production Core Web Vitals measurements. The shared pre-paint colors
remain intentional to avoid a flash when an opted-in theme is restored.

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
