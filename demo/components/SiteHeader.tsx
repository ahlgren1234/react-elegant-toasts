import { useRef } from 'react';
import type { ToastTheme } from 'react-elegant-toasts';
import type { Direction } from '../utils/useDocumentSettings';
import { useHeaderOffset } from '../utils/useHeaderOffset';
import { ExternalLink } from './ExternalLink';
import { GitHubIcon, MoonIcon, NpmIcon, SunIcon, SystemIcon } from './icons';
import { SectionNav } from './SectionNav';

const THEMES = [
  { value: 'system', label: 'System', icon: <SystemIcon /> },
  { value: 'light', label: 'Light', icon: <SunIcon /> },
  { value: 'dark', label: 'Dark', icon: <MoonIcon /> },
] as const satisfies readonly { value: ToastTheme; label: string; icon: unknown }[];

interface SiteHeaderProps {
  theme: ToastTheme;
  onThemeChange: (theme: ToastTheme) => void;
  direction: Direction;
  onDirectionChange: (direction: Direction) => void;
}

export function SiteHeader({
  theme,
  onThemeChange,
  direction,
  onDirectionChange,
}: SiteHeaderProps) {
  const headerRef = useRef<HTMLElement>(null);
  useHeaderOffset(headerRef);

  return (
    <header ref={headerRef} className="d-header">
      <div className="d-container d-header__inner">
        <div className="d-brand">
          <span className="d-brand__mark" aria-hidden="true" />
          <span className="d-brand__name">react-elegant-toasts</span>
          <span className="d-badge">v2</span>
        </div>

        <div className="d-header__settings">
          {/* One theme for the page and the Toaster. */}
          <fieldset className="d-segmented">
            <legend className="d-visually-hidden">Theme</legend>
            {THEMES.map(({ value, label, icon }) => (
              <label key={value} className="d-segmented__option" title={label}>
                <input
                  type="radio"
                  name="theme"
                  value={value}
                  className="d-visually-hidden"
                  checked={theme === value}
                  onChange={() => onThemeChange(value)}
                />
                <span className="d-segmented__face">
                  {icon}
                  <span className="d-compact-label">{label}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <label className="d-switch">
            <input
              type="checkbox"
              role="switch"
              className="d-visually-hidden"
              checked={direction === 'rtl'}
              onChange={e => onDirectionChange(e.target.checked ? 'rtl' : 'ltr')}
            />
            <span className="d-switch__track" aria-hidden="true">
              <span className="d-switch__thumb" />
            </span>
            <span className="d-switch__label">RTL</span>
          </label>
        </div>

        <nav className="d-header__links" aria-label="Project">
          <ExternalLink
            href="https://github.com/ahlgren1234/react-elegant-toasts"
            className="d-icon-link"
            icon={<GitHubIcon />}
            compact
          >
            GitHub
          </ExternalLink>
          <ExternalLink
            href="https://www.npmjs.com/package/react-elegant-toasts"
            className="d-icon-link"
            icon={<NpmIcon size={22} />}
            compact
          >
            npm
          </ExternalLink>
        </nav>
      </div>
      <SectionNav />
    </header>
  );
}
