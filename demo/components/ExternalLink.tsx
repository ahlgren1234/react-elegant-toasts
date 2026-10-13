import type { ReactNode } from 'react';

interface ExternalLinkProps {
  href: string;
  className: string;
  icon: ReactNode;
  children: ReactNode;
  /** Hides the text visually below the header's wide breakpoint; it stays the accessible name. */
  compact?: boolean;
}

export const ExternalLink = ({ href, className, icon, children, compact }: ExternalLinkProps) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
    {icon}
    <span className={compact ? 'd-compact-label' : undefined}>{children}</span>
    <span className="d-visually-hidden"> (opens in a new tab)</span>
  </a>
);
