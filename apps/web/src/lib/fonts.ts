import localFont from 'next/font/local';

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

export const plexSans = localFont({
  src: '../fonts/ibm-plex-sans/IBMPlexSans-Variable.woff2',
  weight: '300 600',
  style: 'normal',
  variable: '--font-plex-sans',
  display: 'swap',
});

export const plexMono = localFont({
  src: [
    { path: '../fonts/ibm-plex-mono/IBMPlexMono-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/ibm-plex-mono/IBMPlexMono-Medium.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const brandFontVariables = `${newsreader.variable} ${plexSans.variable} ${plexMono.variable}`;
