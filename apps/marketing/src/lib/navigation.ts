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
    { label: 'Resources', href: null },
    { label: 'Pricing', href: null },
    { label: 'Trust', href: null },
  ],
  footer: [
    {
      label: 'Platform',
      items: [
        { label: 'Overview', href: '/platform' },
        { label: 'How it works', href: '/how-it-works' },
        { label: 'Pricing', href: null },
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
      label: 'Resources',
      items: [
        { label: 'Knowledge centre', href: null },
        { label: 'Documentation', href: null },
        { label: 'Open source', href: 'https://github.com/scigns/witness' },
      ],
    },
    {
      label: 'Trust',
      items: [
        { label: 'Security', href: null },
        { label: 'Privacy', href: null },
        { label: 'Data sovereignty', href: null },
        { label: 'Accessibility', href: null },
      ],
    },
    {
      label: 'Company',
      items: [
        { label: 'About', href: null },
        { label: 'Contact', href: null },
      ],
    },
    {
      label: 'Legal',
      items: [
        { label: 'Privacy', href: null },
        { label: 'Terms', href: null },
      ],
    },
  ],
} as const satisfies {
  primary: readonly NavigationItem[];
  footer: readonly NavigationGroup[];
};
