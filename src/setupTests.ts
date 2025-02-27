import '@testing-library/jest-dom';

// Mock requestAnimationFrame and cancelAnimationFrame
global.requestAnimationFrame = (callback: FrameRequestCallback): number => {
  return setTimeout(callback, 0);
};

global.cancelAnimationFrame = (id: number): void => {
  clearTimeout(id);
}; 