import { ExternalLink } from './ExternalLink';
import { CoffeeIcon, PortfolioIcon } from './icons';

export const SiteFooter = () => (
  <footer className="d-footer">
    <div className="d-container d-footer__inner">
      <p className="d-footer__note">
        <span className="d-brand__name">react-elegant-toasts</span> · MIT licensed
      </p>
      <nav className="d-footer__links" aria-label="Author">
        <ExternalLink
          href="https://anyawantana.se"
          className="d-footer-link"
          icon={<PortfolioIcon />}
        >
          Portfolio
        </ExternalLink>
        <ExternalLink
          href="https://buymeacoffee.com/peterahlgren"
          className="d-footer-link d-footer-link--coffee"
          icon={<CoffeeIcon />}
        >
          Buy me a coffee
        </ExternalLink>
      </nav>
    </div>
  </footer>
);
