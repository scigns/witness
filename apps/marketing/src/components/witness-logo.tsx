import Image from 'next/image';

import { brandAssets } from '../lib/brand-assets';

/** The approved Witness artwork, kept decorative inside its labelled home link. */
export function WitnessLogo({ priority = false }: { priority?: boolean }) {
  return (
    <Image
      src={brandAssets.logo}
      width={566}
      height={553}
      sizes="(max-width: 62rem) 2.75rem, 3.25rem"
      unoptimized
      priority={priority}
      alt=""
      aria-hidden="true"
      className="brand-logo"
    />
  );
}
