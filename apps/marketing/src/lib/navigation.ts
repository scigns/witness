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
    { label: 'Platform', href: null },
    { label: 'Solutions', href: null },
    { label: 'Resources', href: null },
    { label: 'Pricing', href: null },
    { label: 'Trust', href: null },
  ],
  footer: [
    {
      label: 'Platform',
      items: [
        { label: 'Overview', href: null },
        { label: 'How it works', href: null },
        { label: 'Pricing', href: null },
      ],
    },
    {
      label: 'Solutions',
      items: [
        { label: 'Government', href: null },
        { label: 'International development', href: null },
        { label: 'Research', href: null },
        { label: 'Consultation', href: null },
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
