# Self-hosted brand typefaces

Per the Brand Book (`docs/brand/`), Witness typography is Newsreader (display), IBM Plex Sans
(interface/body) and IBM Plex Mono (evidence/metadata). These are self-hosted here rather than
loaded from a third-party font CDN at runtime, matching this application's existing "no external
font or tracking request" position and the repository's zero-egress principle (P1).

## Source

Each `.woff2` was converted from the upstream variable/static `.ttf` published in the Google Fonts
repository (`google/fonts`, `ofl/` directory), commit current as of 2026-09-05:

- `newsreader/` — <https://github.com/google/fonts/tree/main/ofl/newsreader>
- `ibm-plex-sans/` — <https://github.com/google/fonts/tree/main/ofl/ibmplexsans>
- `ibm-plex-mono/` — <https://github.com/google/fonts/tree/main/ofl/ibmplexmono> (static Regular
  and Medium weights only; Plex Mono is not published as a variable font)

Conversion used `fonttools`' `ttLib.woff2` module with no subsetting — full glyph coverage is
preserved. No hinting, metrics or design data was altered.

## License

Both families are licensed under the SIL Open Font License 1.1. The unmodified license text from
each upstream family ships alongside its files as `OFL.txt`. Redistribution and use in the
compiled marketing application is permitted under that license; the fonts are not modified beyond
container format (`.ttf` -> `.woff2`), which the OFL permits.

## Wiring

Loaded via `next/font/local` in `src/lib/fonts.ts`, which self-hosts, preloads and generates
`font-display: swap` `@font-face` rules at build time — no request ever leaves the deployment for
these assets.
