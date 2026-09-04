import localFont from 'next/font/local';

/**
 * Display typeface (Brand Book 06). Variable font covering the optical-size and
 * weight axes; Light 300 and Regular 400 are the only weights the Brand Book
 * specifies for use, applied via CSS `font-weight` on top of this variable range.
 */
export const newsreader = localFont({
  src: [
    { path: '../fonts/newsreader/Newsreader-Variable.woff2', weight: '300 400', style: 'normal' },
    {
      path: '../fonts/newsreader/Newsreader-Italic-Variable.woff2',
      weight: '300 400',
      style: 'italic',
    },
  ],
  variable: '--font-newsreader',
  display: 'swap',
});

/** Interface/body typeface (Brand Book 06): IBM Plex Sans 300-600. */
export const plexSans = localFont({
  src: '../fonts/ibm-plex-sans/IBMPlexSans-Variable.woff2',
  weight: '300 600',
  style: 'normal',
  variable: '--font-plex-sans',
  display: 'swap',
});

/** Evidence/metadata typeface (Brand Book 06): machine-generated facts only. */
export const plexMono = localFont({
  src: [
    { path: '../fonts/ibm-plex-mono/IBMPlexMono-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/ibm-plex-mono/IBMPlexMono-Medium.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const brandFontVariables = `${newsreader.variable} ${plexSans.variable} ${plexMono.variable}`;
