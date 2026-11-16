# Annotation font

Source: [Google Fonts / Noto Sans SC](https://github.com/google/fonts/tree/main/ofl/notosanssc), `NotoSansSC[wght].ttf`.
License: SIL Open Font License 1.1, included in `OFL.txt`.

`annotation-sans-medium.woff2` is a static weight-500 subset, generated with fontTools 4.65.0. It includes GB2312 characters, Latin U+0020–024F, punctuation U+2000–206F / U+3000–303F, and full-width U+FF00–FFEE. Other characters fall back to the platform fonts. The source font is not shipped. The 1.1 MB local WOFF2 needs no external font service; browsers cache it normally.

Apple devices prefer their installed PingFang SC; other platforms use this bundled font before CJK system fallbacks. Both SVG preview and Canvas export request the same family and weight through `label-typography.js`.

To regenerate, install `fonttools` and `brotli`, then run `python scripts/subset-dimension-font.py path/to/NotoSansSC.ttf` from the repository root. Retain the upstream OFL file alongside the generated asset.
