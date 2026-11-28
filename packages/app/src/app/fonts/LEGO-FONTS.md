# LEGO theme fonts

Used only by the optional LEGO theme (`.lego` selectors in the dynamically loaded
`components/lego/lego-theme.css`). The `@font-face` rules live in that stylesheet, so neither
the declarations nor the files are loaded by the default light/dark page.

| File                  | CSS family  | Typeface                             | Source                                                                                                | SHA-256                                                            |
| --------------------- | ----------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `Lego-TitanOne.woff2` | `LegoBrick` | Titan One Regular                    | [Google Fonts](https://fonts.gstatic.com/s/titanone/v17/mFTzWbsGxbbS_J5cQcjClDgm.woff2)               | `2f15f138af309ad659b62246999cccc2da21759ec8619d7e6ea759e8eb5a7a53` |
| `Lego-Fredoka.woff2`  | `LegoBody`  | Fredoka variable (weight 300 to 700) | [Google Fonts](https://fonts.gstatic.com/s/fredoka/v17/X7n64b87HvSqjb_WIi2yDCRwoQ_k7367_DWu89U.woff2) | `99d6c78e043710d4f83ed90716779798b7b04eb690f73e0ad0e8f32d1f0e98c2` |

Files are unmodified copies of the Google Fonts Latin subsets, downloaded on 2026-11-25 and
renamed. Titan One is Copyright (c) 2011 Rodrigo Fuenzalida; Fredoka is Copyright 2016 The
Fredoka Project Authors. Both are licensed under the
[SIL Open Font License 1.1](https://openfontlicense.org/open-font-license-official-text/).

Neither typeface is a LEGO Group font. They were chosen as freely licensed stand-ins for the
rounded, heavy lettering on LEGO packaging. Chinese text falls back to the site's system CJK
stack.
