import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ToastProvider, useToast } from '../ToastContext';

const TestComponent = () => {
  const { addToast, removeAll } = useToast();

  return (
    <div>
      <button
        onClick={() =>
          addToast({
            message: 'Test toast',
            type: 'info',
            duration: 3000,
          })
        }
      >
        Add Toast
      </button>
      <button onClick={removeAll}>Remove All</button>
    </div>
  );
};

describe('ToastContext', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Mock visibility API
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get() {
        return false;
      },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should add and display toast', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    act(() => {
      fireEvent.click(screen.getByText('Add Toast'));
    });

    expect(screen.getByText('Test toast')).toBeInTheDocument();
  });

  it('should pause toasts when page becomes hidden', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    // Add a toast
    act(() => {
      fireEvent.click(screen.getByText('Add Toast'));
    });

    const toast = screen.getByText('Test toast');
    expect(toast).toBeInTheDocument();

    // Simulate page becoming hidden
    act(() => {
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get() {
          return true;
        },
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Toast should still be visible because it's paused
    expect(toast).toBeInTheDocument();
  });

  it('should pause toasts on window blur', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    // Add a toast
    act(() => {
      fireEvent.click(screen.getByText('Add Toast'));
    });

    const toast = screen.getByText('Test toast');
    expect(toast).toBeInTheDocument();

    // Simulate window blur
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });

    // Toast should still be visible because it's paused
    expect(toast).toBeInTheDocument();
  });

  it('should resume toasts on window focus', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    // Add a toast
    act(() => {
      fireEvent.click(screen.getByText('Add Toast'));
    });

    const toast = screen.getByText('Test toast');

    // Simulate window blur
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });

    // Toast should still be visible because it's paused
    expect(toast).toBeInTheDocument();

    // Simulate window focus
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    // Fast-forward time
    act(() => {
      jest.advanceTimersByTime(3000);
    });

    // Toast should be removed after duration
    expect(screen.queryByText('Test toast')).not.toBeInTheDocument();
  });

  it('should remove all toasts', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    // Add multiple toasts
    act(() => {
      fireEvent.click(screen.getByText('Add Toast'));
      fireEvent.click(screen.getByText('Add Toast'));
    });

    expect(screen.getAllByText('Test toast')).toHaveLength(2);

    // Remove all toasts
    act(() => {
      fireEvent.click(screen.getByText('Remove All'));
    });

    expect(screen.queryByText('Test toast')).not.toBeInTheDocument();
  });

  it('should respect maxToasts limit', () => {
    render(
      <ToastProvider maxToasts={2}>
        <TestComponent />
      </ToastProvider>
    );

    // Add three toasts
    act(() => {
      fireEvent.click(screen.getByText('Add Toast'));
      fireEvent.click(screen.getByText('Add Toast'));
      fireEvent.click(screen.getByText('Add Toast'));
    });

    // Should only show 2 toasts
    expect(screen.getAllByText('Test toast')).toHaveLength(2);
  });
});
