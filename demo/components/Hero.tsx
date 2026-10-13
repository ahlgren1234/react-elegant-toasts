import { toast } from 'react-elegant-toasts';

export const Hero = () => (
  <section className="d-hero" aria-labelledby="hero-heading">
    <div className="d-container d-hero__inner">
      <h1 id="hero-heading" className="d-hero__title">
        Elegant toasts for React.
      </h1>
      <p className="d-hero__lede">
        Accessible by default, themeable with CSS tokens, and ready for right-to-left layouts,
        keyboards and reduced motion.
      </p>
      <div className="d-hero__actions">
        <button
          type="button"
          className="d-button d-button--primary d-button--large"
          onClick={() =>
            toast.success('Toast delivered', {
              description: 'Press Alt+T to move focus to it, and Escape to come back.',
            })
          }
        >
          Show a toast
        </button>
        <a className="d-button d-button--secondary d-button--large" href="#playground">
          Open the playground
        </a>
      </div>
      <p className="d-install">
        <span className="d-install__prompt" aria-hidden="true">
          $
        </span>
        <code>npm install react-elegant-toasts</code>
      </p>
    </div>
  </section>
);
