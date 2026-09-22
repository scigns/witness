export interface NavigationItem {
  label: string;
  href: string | null;
}

export interface NavigationGroup {
  label: string;
  items: readonly NavigationItem[];
}

export const marketingNavigation = {
  primary: [
    { label: 'Platform', href: '/platform' },
    { label: 'Solutions', href: '/solutions' },
    { label: 'Why Witness', href: '/why-witness' },
  ],
  footer: [
    {
      label: 'Platform',
      items: [
        { label: 'Overview', href: '/platform' },
        { label: 'How it works', href: '/how-it-works' },
        { label: 'Evidence', href: '/platform/evidence' },
        { label: 'Institutional memory', href: '/platform/institutional-memory' },
      ],
    },
    {
      label: 'Solutions',
      items: [
        { label: 'Government', href: '/solutions/government' },
        { label: 'International development', href: '/solutions/international-development' },
        { label: 'Research', href: '/solutions/research' },
        { label: 'Consultation', href: '/solutions/consultation' },
      ],
    },
    {
      label: 'Witness',
      items: [
        { label: 'Why Witness', href: '/why-witness' },
        { label: 'Open source', href: 'https://github.com/scigns/witness' },
      ],
    },
  ],
} as const satisfies {
  primary: readonly NavigationItem[];
  footer: readonly NavigationGroup[];
};
