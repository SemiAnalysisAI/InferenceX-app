# Ghibli theme fonts

Used only by the optional Ghibli theme (`.ghibli` selectors in the dynamically
loaded `components/ghibli/ghibli-theme.css`). The `@font-face` rules live in that
file, so the default light/dark page never downloads these fonts.

No official Studio Ghibli typeface is available as a free file. These are open
source stand-ins: a soft, hand-set serif for display text and a rounded sans for
body text. They are not Ghibli lettering.

Files are the latin subsets served by the Google Fonts CSS API
(`https://fonts.googleapis.com/css2?...`), saved unmodified and renamed with the
`Ghibli-` prefix. Downloaded on 2026-11-25.

| File                                 | CSS family                | Font                                              | Source URL                                                                                                                 | SHA-256                                                            | License                                                                                                                              |
| ------------------------------------ | ------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `Ghibli-Fraunces-SoftSemiBold.woff2` | `GhibliDisplay`           | Fraunces, weight 600, SOFT 100, optical size axis | https://fonts.gstatic.com/s/fraunces/v38/6NUu8FyLNQOQZAnv9bYEvDiIdE9Ea92usiIk_WBq8U_9v0c2Wa0K7iN7iQcIfJD58njt0oc7qv8.woff2 | `07646c7f9b788c2341d7fb5424a7ef21ecaa787e66487c8ada87697a2384d684` | SIL Open Font License 1.1 ([Undercase Type, github.com/undercasetype/Fraunces](https://github.com/undercasetype/Fraunces))           |
| `Ghibli-ZenMaruGothic-Medium.woff2`  | `GhibliRounded` (100-600) | Zen Maru Gothic Medium (500)                      | https://fonts.gstatic.com/s/zenmarugothic/v20/o-0XIpIxzW5b-RxT-6A8jWAtCp-cGWtyO5Cb.woff2                                   | `2c5953da616e5e6dcad34ae8b744f7e759f1647c041389681fa2360908508d55` | SIL Open Font License 1.1 ([Yoshimichi Ohira, github.com/googlefonts/zen-marugothic](https://github.com/googlefonts/zen-marugothic)) |
| `Ghibli-ZenMaruGothic-Bold.woff2`    | `GhibliRounded` (601-900) | Zen Maru Gothic Bold (700)                        | https://fonts.gstatic.com/s/zenmarugothic/v20/o-0XIpIxzW5b-RxT-6A8jWAtCp-cUW1yO5Cb.woff2                                   | `9d65f92a3e11edcef9d73694b5b73cb6888243aee54e8034b162eb368c6ff3ed` | SIL Open Font License 1.1 ([Yoshimichi Ohira, github.com/googlefonts/zen-marugothic](https://github.com/googlefonts/zen-marugothic)) |

## Wordmark font (added in round ip-r1)

The Studio Ghibli logo is set in a geometric sans close to ITC Avant Garde Gothic
(see https://peoplesgdarchive.org/item/11936/studio-ghibli-logosutazioziburizuo-pin-rogo).
That typeface is commercial, so the banner title uses TeX Gyre Adventor, a free
font based on URW Gothic L, which follows Avant Garde. It is not the studio's
own lettering.

| File                                    | CSS family       | Font                                    | Source URL                                                                   | Fetched    | Changes                                                                                     | SHA-256                                                            | License                                                            |
| --------------------------------------- | ---------------- | --------------------------------------- | ---------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `Ghibli-Adventor-Regular.woff2`         | `GhibliWordmark` | TeX Gyre Adventor Regular (qag2_501otf) | https://www.gust.org.pl/projects/e-foundry/tex-gyre/adventor/qag2_501otf.zip | 2026-11-26 | `texgyreadventor-regular.otf` subset to latin with pyftsubset, saved as WOFF2 (12632 bytes) | `f78f81d12a7a74b6558941cd14b2274ca54a6b20a3f13475538509a4f7d680b0` | GUST Font License, text in `Ghibli-Adventor-GUST-FONT-LICENSE.txt` |
| `Ghibli-Adventor-GUST-FONT-LICENSE.txt` |                  | GUST Font License 1.0 text              | https://www.gust.org.pl/projects/e-foundry/licenses/GUST-FONT-LICENSE.txt    | 2026-11-26 | none                                                                                        | `5eb61bb836bb1845ef668717cb15b382e997748ce2629e4388cc5e4c3fa4e433` |                                                                    |

The GUST Font License asks that modified versions be renamed. The file is renamed
and subset, but the font's internal name tables were not changed; that is still
open.
Chinese text falls back to the system CJK font
stack. The OFL allows bundling and redistribution with software; the font
names stay with their authors and the files are not sold on their own.

Artwork and sound provenance is documented separately in
`public/decorative/ghibli/README.md`.
