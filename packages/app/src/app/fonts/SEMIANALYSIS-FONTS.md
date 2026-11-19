# SemiAnalysis theme fonts

Used only by the SemiAnalysis theme (`.semianalysis` selectors in the dynamically loaded
`components/semianalysis/semianalysis-theme.css`). Font declarations and files are not loaded
by the default light/dark page.

| File                    | Embedded name | Source                                                                                                            |
| ----------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------- |
| `Anton-Regular.woff2`   | SA Anton      | `Anton-Regular.ttf` shipped with the SemiAnalysis Offsite 2026 slide template (Latin subset)                      |
| `Outfit-Variable.woff2` | SA Outfit     | [google/fonts `ofl/outfit/Outfit[wght].ttf`](https://github.com/google/fonts/tree/main/ofl/outfit) (Latin subset) |

Both files are Latin subsets converted to WOFF2 with fontTools on 2026-11-18. Anton and Outfit
are licensed under the SIL Open Font License 1.1; the licenses ship alongside the files in
`Anton-OFL.txt` and `Outfit-OFL.txt`. The repository's code license does not relicense these
fonts.
