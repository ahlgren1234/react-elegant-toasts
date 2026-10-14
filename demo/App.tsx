import { useState } from 'react';
import { Toaster, type ToastTheme } from 'react-elegant-toasts';
import { Accessibility } from './components/Accessibility';
import { CustomToast } from './components/CustomToast';
import { Hero } from './components/Hero';
import { Lifecycle } from './components/Lifecycle';
import { Playground } from './components/Playground';
import { SiteFooter } from './components/SiteFooter';
import { SiteHeader } from './components/SiteHeader';
import { Theming } from './components/Theming';
import { DEFAULT_CONFIG, toToasterSettings, type PlaygroundConfig } from './utils/playground';
import { useDocumentSettings, type Direction } from './utils/useDocumentSettings';

export function App() {
  const [theme, setTheme] = useState<ToastTheme>('system');
  const [direction, setDirection] = useState<Direction>('ltr');
  const [config, setConfig] = useState<PlaygroundConfig>(DEFAULT_CONFIG);
  useDocumentSettings(theme, direction);

  return (
    <>
      <div className="d-page">
        <a className="d-skip-link" href="#main">
          Skip to content
        </a>
        <SiteHeader
          theme={theme}
          onThemeChange={setTheme}
          direction={direction}
          onDirectionChange={setDirection}
        />
        <main id="main">
          <Hero />
          <Playground config={config} onChange={setConfig} theme={theme} />
          <Lifecycle />
          <CustomToast />
          <Theming />
          <Accessibility />
        </main>
        <SiteFooter />
      </div>
      {/* A sibling of the page, so no page style reaches the toasts. Its props are the ones the
          playground's code shows. */}
      <Toaster {...toToasterSettings(config, theme)} />
    </>
  );
}
