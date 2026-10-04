# Presentation themes

## How Minecraft works

The root `ThemeProvider` in `packages/app/src/app/layout.tsx` uses `next-themes`
to persist a theme and apply its class to `<html>` before hydration. The
header's `ModeToggle` cycles explicit themes and emits `theme_toggled`.
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

The cycle is `light → dark → minecraft → csgo → light`. `src/lib/themes.ts`
centralizes theme order and dark-background classification. CS:GO retains the
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

## Data/API coverage

This is a presentation-only control: no filter, metric, calculation, route,
share parameter, or returned data changes. Under the documented
presentation-control exclusion, no API contract or `packages/skills` change
is required. The shared palette paths apply to official and unofficial data;
the overlay CSS variables inherit the existing dark palette.

## Verification inventory

- Full theme cycle, unknown/system fallback, persistence after reload, and
  cleanup on exit.
- No CS:GO image requests on a cold light/dark landing; images load only
  after selection, with a smaller mobile crop.
- CS:GO uses dark figure sources and chart colors, including high-contrast.
  PNG/MP4 footer contrast uses the same shared dark-theme classifier.
- Desktop and narrow mobile landing/chart views, keyboard focus, Chinese
  routes, and reduced-motion preference.
- Existing Minecraft decoration/splash tests, shared header utility geometry,
  and wordmark contrast run alongside the new tests.
