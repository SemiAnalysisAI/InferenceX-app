# CS:GO theme fonts

Used only by the CS:GO theme (`.csgo` selectors in the dynamically loaded
`components/csgo/csgo-theme.css`). Font declarations and files are not loaded
by the default light/dark page.

| File                      | Embedded name | Weight | Source                                                                                                                  |
| ------------------------- | ------------- | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| `Csgo-Rajdhani-700.woff2` | Rajdhani      | 700    | [fontsource rajdhani latin-700-normal](https://cdn.jsdelivr.net/fontsource/fonts/rajdhani@5.2.6/latin-700-normal.woff2) |
| `Csgo-Rajdhani-600.woff2` | Rajdhani      | 600    | [fontsource rajdhani latin-600-normal](https://cdn.jsdelivr.net/fontsource/fonts/rajdhani@5.2.6/latin-600-normal.woff2) |
| `Csgo-Barlow-400.woff2`   | Barlow        | 400    | [fontsource barlow latin-400-normal](https://cdn.jsdelivr.net/fontsource/fonts/barlow@5.2.6/latin-400-normal.woff2)     |
| `Csgo-Barlow-600.woff2`   | Barlow        | 600    | [fontsource barlow latin-600-normal](https://cdn.jsdelivr.net/fontsource/fonts/barlow@5.2.6/latin-600-normal.woff2)     |

Files are unmodified copies of the fontsource latin subsets, downloaded on
2026-11-26. Filenames are prefixed `Csgo-` so the theme chunk can be told apart
from other copies. The name-table copyright on the Rajdhani files is
`Copyright (c) 2014, Indian Type Foundry (info@indiantypefoundry.com)`. The
name-table copyright on the Barlow files is
`Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow)`.

Both families ship under the SIL Open Font License 1.1. The license texts were
copied on 2026-11-26 from the Google Fonts upstream files
([Rajdhani OFL](https://github.com/google/fonts/raw/main/ofl/rajdhani/OFL.txt),
[Barlow OFL](https://github.com/google/fonts/raw/main/ofl/barlow/OFL.txt)) and
sit next to these fonts as `Rajdhani-OFL.txt` and `Barlow-OFL.txt`.

Artwork provenance is documented separately in `public/decorative/csgo/README.md`.
