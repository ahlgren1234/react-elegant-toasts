import { SECTIONS } from '../utils/site';

// The in-page navigation (P-25 S7): plain fragment links, so the browser scrolls, moves the focus
// starting point and keeps history. The page's scroll padding keeps a target clear of the sticky
// header, and smooth scrolling is on only without a reduced-motion preference.
export const SectionNav = () => (
  <nav className="d-section-nav" aria-label="Sections">
    <ul className="d-container d-section-nav__list">
      {SECTIONS.map(({ id, label }) => (
        <li key={id}>
          <a className="d-section-nav__link" href={`#${id}`}>
            {label}
          </a>
        </li>
      ))}
    </ul>
  </nav>
);
