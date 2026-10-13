import { useState } from 'react';
import { Toaster, type ToastPosition, type ToastTheme } from 'react-elegant-toasts';
import { Hero } from './components/Hero';
import { Playground } from './components/Playground';
import { SiteFooter } from './components/SiteFooter';
import { SiteHeader } from './components/SiteHeader';
import { useDocumentSettings, type Direction } from './lib/useDocumentSettings';

export function App() {
  const [theme, setTheme] = useState<ToastTheme>('system');
  const [direction, setDirection] = useState<Direction>('ltr');
  const [position, setPosition] = useState<ToastPosition>('top-right');
  useDocumentSettings(theme, direction);

  return (
    <>
      <div className="d-page">
        <a className="d-skip-link" href="#playground">
          Skip to the playground
        </a>
        <SiteHeader
          theme={theme}
          onThemeChange={setTheme}
          direction={direction}
          onDirectionChange={setDirection}
        />
        <main>
          <Hero />
          <Playground position={position} onPositionChange={setPosition} />
        </main>
        <SiteFooter />
      </div>
      {/* A sibling of the page, so no page style reaches the toasts. Six visible per stack, so the
          All types example shows at once (the default is 4). */}
      <Toaster theme={theme} position={position} maxVisible={6} />
    </>
  );
}
