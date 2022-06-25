# Mojidata - Character Database for Japanese Text Processing

This package provides SQLite database about Japanese characters.

The following data are included:

- [Adobe], [Adobe-Japan1 CMap Resources](https://github.com/adobe-type-tools/cmap-resources) (aj1)
- [Unicode], [Unicode Character Database](https://www.unicode.org/reports/tr44/)
    - CJK Radicals (radicals)
    - Standardized Variants (svs)
    - Equivalent Unified Ideograph (radeqv)
    - [U-Source](https://www.unicode.org/reports/tr45/) Data (usource)
    - [Unicode Han Database](https://www.unicode.org/reports/tr38/) (unihan)
- [Unicode], [Ideographic Variation Database](https://unicode.org/ivd/) (ivs)
- [CITPC], [List of MJ Characters](https://moji.or.jp/mojikiban/mjlist/) (mji)
- [CITPC], [MJ Map](https://moji.or.jp/mojikiban/map/) (mjsm)
- [BabelStone], Ideographic Description Sequences (IDS) for CJK Unified Ideographs (ids)
- [文化庁], [常用漢字表](https://www.bunka.go.jp/kokugo_nihongo/sisaku/joho/joho/kijun/naikaku/kanji/) (joyo)

[Adobe]: https://www.adobe.com/
[Unicode]: https://home.unicode.org/
[CITPC]: https://moji.or.jp/mojikiban/
[BabelStone]: https://www.babelstone.co.uk/Fonts/Han.html
[文化庁]: https://www.bunka.go.jp/

## License

The source code of Mojidata is available under the MIT license.

Some resources are bundled with the package. See [download.txt](download.txt)
for the bundled resources and the source URLs of them.

Each of these resources is available under its own license.

See [LICENSE.md](LICENSE.md) for details.
