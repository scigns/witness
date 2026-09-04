import type { NavigationItem } from '../lib/navigation';

export function NavigationItems({
  items,
  className,
}: {
  items: readonly NavigationItem[];
  className?: string;
}) {
  return (
    <ul className={className}>
      {items.map((item) => (
        <li key={item.label}>
          {item.href === null ? (
            <span className="navigation-planned" aria-disabled="true">
              {item.label}
              <span className="visually-hidden"> — page planned</span>
            </span>
          ) : (
            <a href={item.href}>{item.label}</a>
          )}
        </li>
      ))}
    </ul>
  );
}
