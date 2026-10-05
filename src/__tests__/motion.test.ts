// The lifecycle fallback's timing (§9 rule 3, P-18 D0 decisions 2, 3, 7 and 9): the library
// animation names, CSS time parsing and the computed-style calculation, apart from React.
import { describe, expect, it } from 'vitest';
import {
  fallbackDelay,
  LIFECYCLE_FALLBACK_MARGIN_MS,
  libraryAnimationName,
  parseTime,
  type AnimationStyle,
} from '../react/motion';
import type { ToastPosition } from '../types';

const ENTER = 'ret-enter-top';

const style = (name: string, duration: string, delay = '0s'): AnimationStyle => ({
  animationName: name,
  animationDuration: duration,
  animationDelay: delay,
});

describe('library animation names (P-18 D0, decision 7)', () => {
  it.each<[ToastPosition, string, string]>([
    ['top-left', 'ret-enter-top', 'ret-exit-top'],
    ['top-center', 'ret-enter-top', 'ret-exit-top'],
    ['top-right', 'ret-enter-top', 'ret-exit-top'],
    ['bottom-left', 'ret-enter-bottom', 'ret-exit-bottom'],
    ['bottom-center', 'ret-enter-bottom', 'ret-exit-bottom'],
    ['bottom-right', 'ret-enter-bottom', 'ret-exit-bottom'],
  ])(
    '%s enters with %s and exits with %s, whatever its horizontal placement',
    (position, enter, exit) => {
      expect(libraryAnimationName('entering', position)).toBe(enter);
      expect(libraryAnimationName('exiting', position)).toBe(exit);
    }
  );
});

describe('parseTime', () => {
  it.each<[string, number]>([
    ['0s', 0],
    ['0ms', 0],
    ['0.2s', 200],
    ['.25s', 250],
    ['1s', 1000],
    ['150ms', 150],
    ['  150ms  ', 150],
    ['1.5S', 1500],
    ['1e2ms', 100],
    ['-50ms', -50],
    ['-0.1s', -100],
  ])('reads %j as %d ms', (value, ms) => {
    expect(parseTime(value)).toBe(ms);
  });

  it.each([
    '',
    'auto',
    'none',
    '200',
    's',
    'ms',
    '1x',
    '1 s',
    'calc(1s)',
    'NaNs',
    'Infinitys',
    '1e400s',
  ])('rejects %j as unusable', value => {
    expect(parseTime(value)).toBeUndefined();
  });
});

describe('fallbackDelay (P-18 D0, decisions 2, 3 and 9)', () => {
  describe('the immediate path: 0, with no margin', () => {
    it('when the expected animation is absent', () => {
      expect(fallbackDelay(style('consumer-pop', '1s'), ENTER)).toBe(0);
    });

    it('when animation-name is none', () => {
      expect(fallbackDelay(style('none', '0s'), ENTER)).toBe(0);
    });

    it('when the matching animation lasts 0s', () => {
      expect(fallbackDelay(style(ENTER, '0s'), ENTER)).toBe(0);
      expect(fallbackDelay(style(ENTER, '0ms', '0ms'), ENTER)).toBe(0);
    });

    it("for jsdom's computed style, which reports no animation and an auto duration", () => {
      expect(fallbackDelay(style('none', 'auto', '0s'), ENTER)).toBe(0);
      expect(fallbackDelay(style(ENTER, 'auto', '0s'), ENTER)).toBe(0);
    });

    it('when the styles are missing or empty', () => {
      const missing = { animationName: undefined, animationDuration: null, animationDelay: '' };
      expect(fallbackDelay(missing, ENTER)).toBe(0);
      expect(fallbackDelay(style('', '', ''), ENTER)).toBe(0);
    });
  });

  describe('a positive end time, plus exactly the margin', () => {
    it('is 100 ms', () => {
      expect(LIFECYCLE_FALLBACK_MARGIN_MS).toBe(100);
    });

    it('reads seconds and milliseconds', () => {
      expect(fallbackDelay(style(ENTER, '0.2s'), ENTER)).toBe(200 + 100);
      expect(fallbackDelay(style(ENTER, '180ms'), ENTER)).toBe(180 + 100);
    });

    it('adds the delay to the duration', () => {
      expect(fallbackDelay(style(ENTER, '200ms', '50ms'), ENTER)).toBe(250 + 100);
      expect(fallbackDelay(style(ENTER, '0s', '50ms'), ENTER)).toBe(50 + 100);
    });

    it('ignores whitespace around the list entries', () => {
      expect(
        fallbackDelay(
          style(' consumer-pop ,  ret-enter-top ', ' 1s ,  200ms ', ' 0s , 10ms '),
          ENTER
        )
      ).toBe(210 + 100);
    });

    it('accepts a name the computed style serialises as a string', () => {
      expect(fallbackDelay(style('"ret-enter-top"', '200ms'), ENTER)).toBe(300);
      expect(fallbackDelay(style("'ret-enter-top'", '200ms'), ENTER)).toBe(300);
    });

    it('matches the name exactly: case and other edges or phases do not count', () => {
      expect(fallbackDelay(style('RET-ENTER-TOP', '200ms'), ENTER)).toBe(0);
      expect(fallbackDelay(style('ret-enter-bottom', '200ms'), ENTER)).toBe(0);
      expect(fallbackDelay(style('ret-exit-top', '200ms'), ENTER)).toBe(0);
      expect(fallbackDelay(style('ret-enter-top-x', '200ms'), ENTER)).toBe(0);
    });
  });

  // CSS pairs the animation longhands by index, and the number of animations is the length of
  // `animation-name`: a shorter list repeats from its start, a longer one is cut off.
  describe('comma-separated lists, paired as CSS pairs them', () => {
    it('finds the expected name when it is not first', () => {
      expect(
        fallbackDelay(style('consumer-a, consumer-b, ret-enter-top', '1s, 2s, 300ms'), ENTER)
      ).toBe(400);
    });

    it('repeats a shorter duration list', () => {
      // Durations repeat as 100ms, 400ms, 100ms: the third name takes the first duration.
      expect(
        fallbackDelay(style('consumer-a, consumer-b, ret-enter-top', '100ms, 400ms'), ENTER)
      ).toBe(100 + 100);
    });

    it('repeats a shorter delay list', () => {
      // Delays repeat as 5ms, 20ms, 5ms, 20ms: the fourth name takes the second delay.
      expect(
        fallbackDelay(
          style(
            'consumer-a, consumer-b, consumer-c, ret-enter-top',
            '1s, 1s, 1s, 200ms',
            '5ms, 20ms'
          ),
          ENTER
        )
      ).toBe(220 + 100);
    });

    it('repeats both shorter lists independently', () => {
      // Five names; durations 300ms, 200ms repeat; delays 0s, 30ms, 60ms repeat.
      // The fifth name takes duration index 0 (300ms) and delay index 1 (30ms).
      expect(
        fallbackDelay(style('a, b, c, d, ret-enter-top', '300ms, 200ms', '0s, 30ms, 60ms'), ENTER)
      ).toBe(330 + 100);
    });

    it('ignores the surplus of a longer duration or delay list', () => {
      expect(fallbackDelay(style(ENTER, '200ms, 5s', '0s, 5s'), ENTER)).toBe(300);
    });

    it('uses the latest positive end when the expected name repeats', () => {
      expect(
        fallbackDelay(style('ret-enter-top, consumer, ret-enter-top', '100ms, 9s, 250ms'), ENTER)
      ).toBe(250 + 100);
      expect(
        fallbackDelay(style('ret-enter-top, ret-enter-top', '400ms, 100ms', '0s, 50ms'), ENTER)
      ).toBe(400 + 100);
    });

    it('keeps the index of a none entry, which pairs but never matches', () => {
      expect(fallbackDelay(style('none, ret-enter-top', '5s, 200ms'), ENTER)).toBe(300);
    });
  });

  describe('consumer animations (decision 9)', () => {
    it('never extend the fallback, however long they run', () => {
      expect(
        fallbackDelay(style('consumer-pop, ret-enter-top', '10s, 200ms', '5s, 0s'), ENTER)
      ).toBe(300);
    });

    it('never supply a fallback of their own', () => {
      expect(fallbackDelay(style('consumer-pop', '10s', '1s'), ENTER)).toBe(0);
    });

    it("never count the spinner's ret-spin, which is not an enter or exit animation", () => {
      expect(fallbackDelay(style('ret-spin', '1s'), ENTER)).toBe(0);
      expect(fallbackDelay(style('ret-spin', '1s'), 'ret-exit-bottom')).toBe(0);
      expect(fallbackDelay(style('ret-spin, ret-enter-top', '5s, 180ms'), ENTER)).toBe(280);
    });
  });

  // A negative delay starts the animation part-way through its run, so it ends that much sooner.
  // The end time is delay + duration, never max(delay, 0) + duration.
  describe('negative delays, with CSS timing', () => {
    it('shorten the run instead of being clamped to zero', () => {
      expect(fallbackDelay(style(ENTER, '300ms', '-100ms'), ENTER)).toBe(200 + 100);
    });

    it('leave nothing to wait for once they reach the duration', () => {
      expect(fallbackDelay(style(ENTER, '300ms', '-300ms'), ENTER)).toBe(0);
      expect(fallbackDelay(style(ENTER, '300ms', '-1s'), ENTER)).toBe(0);
    });

    it('do not hide another matching entry that still runs', () => {
      expect(
        fallbackDelay(style('ret-enter-top, ret-enter-top', '300ms, 200ms', '-1s, 0s'), ENTER)
      ).toBe(300);
    });
  });

  describe('unusable values, defensively', () => {
    it('count an invalid or negative duration as zero', () => {
      expect(fallbackDelay(style(ENTER, 'auto'), ENTER)).toBe(0);
      expect(fallbackDelay(style(ENTER, 'soon'), ENTER)).toBe(0);
      expect(fallbackDelay(style(ENTER, '-200ms'), ENTER)).toBe(0);
      expect(fallbackDelay(style(ENTER, 'soon', '50ms'), ENTER)).toBe(50 + 100);
    });

    it('count an invalid delay as zero', () => {
      expect(fallbackDelay(style(ENTER, '200ms', 'later'), ENTER)).toBe(300);
      expect(fallbackDelay(style(ENTER, '200ms', 'NaNs'), ENTER)).toBe(300);
    });

    it('never return NaN or Infinity, and never a delay setTimeout cannot honour', () => {
      for (const [duration, delay] of [
        ['NaNs', 'NaNs'],
        ['Infinitys', '0s'],
        ['1e400s', '1e400s'],
        ['1e300s', '0s'],
      ] as const) {
        const result = fallbackDelay(style(ENTER, duration, delay), ENTER);
        expect(Number.isFinite(result)).toBe(true);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(2 ** 31 - 1);
      }
      expect(fallbackDelay(style(ENTER, '1e300s'), ENTER)).toBe(2 ** 31 - 1);
    });
  });
});
