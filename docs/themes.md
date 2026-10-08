# Presentation Themes

## Light and dark

The root `ThemeProvider` in `packages/app/src/app/layout.tsx` uses `next-themes`
to persist a theme and apply its class to `<html>` before hydration. The
default is dark; the system setting remains supported. `src/lib/themes.ts`
lists the picker themes (`light`, `dark`) and the dark-background
classification shared by charts, figures and exports.

A saved theme that is no longer in `APP_THEMES` (the retired decorative themes)
is reset to `dark` by `retiredThemePrepaintScript`, which runs before the
`next-themes` boot script.

The autumn leaves and the Halloween wordmark are seasonal decorations, not
themes. The leaves have their own header toggle.

## Picker accessibility

The header's `ModeToggle` is an icon-only picker. The trigger keeps
`data-testid="theme-toggle"` and its `Switch theme (currently <theme> mode)`
label. Options are `role="radio"` in a labelled `radiogroup`
(`data-testid="theme-option-<theme>"`), with localized `aria-label`/`title`
text, roving tab index, arrow/Home/End navigation, and Escape to close.
Options stay 44px on phones and 36px from `md`. Selecting a theme emits
`theme_toggled`.

## Data/API coverage

This is a presentation-only control: no filter, metric, calculation, route,
share parameter, or returned data changes. Under the documented
presentation-control exclusion, no API contract or `packages/skills` change
is required.
