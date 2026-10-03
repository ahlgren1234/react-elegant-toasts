// The isomorphic layout effect in the browser (§23): layout-effect timing, so it runs within the
// commit, before passive effects. Its server behaviour is tested in ssr.test.tsx.
import { render } from '@testing-library/react';
import { StrictMode, useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import { useIsomorphicLayoutEffect } from '../react/useIsomorphicLayoutEffect';

describe('useIsomorphicLayoutEffect in the browser', () => {
  it('runs as a layout effect: before a passive effect declared ahead of it', () => {
    const log: string[] = [];
    function Probe({ value }: { value: number }) {
      useEffect(() => {
        log.push(`passive ${value}`);
      }, [value]);
      useIsomorphicLayoutEffect(() => {
        log.push(`layout ${value}`);
      }, [value]);
      return null;
    }
    const { rerender } = render(<Probe value={1} />);
    rerender(<Probe value={2} />);
    expect(log).toEqual(['layout 1', 'passive 1', 'layout 2', 'passive 2']);
  });

  it('sees the committed DOM, and is replayed with its cleanup under StrictMode', () => {
    const log: string[] = [];
    function Probe() {
      useIsomorphicLayoutEffect(() => {
        log.push(`mount ${document.querySelector('[data-probe]') ? 'attached' : 'detached'}`);
        return () => {
          log.push('cleanup');
        };
      }, []);
      return <div data-probe />;
    }
    render(
      <StrictMode>
        <Probe />
      </StrictMode>
    );
    expect(log).toEqual(['mount attached', 'cleanup', 'mount attached']);
  });
});
