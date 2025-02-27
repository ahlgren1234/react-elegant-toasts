import React from 'react';
import { render, fireEvent, act } from '@testing-library/react';
import Toast from '../Toast';

describe('Toast', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const getToastElement = (container: HTMLElement) => {
    return container.querySelector('.toast') as HTMLElement;
  };

  it('renders with default props', () => {
    const { getByText } = render(<Toast message="Test message" id="1" />);
    expect(getByText('Test message')).toBeInTheDocument();
  });

  it('renders with custom type and title', () => {
    const { getByText } = render(
      <Toast message="Test message" id="1" type="success" title="Success!" />
    );
    expect(getByText('Success!')).toBeInTheDocument();
    expect(getByText('Test message')).toBeInTheDocument();
  });

  it('calls onClose when clicked and closeOnClick is true', () => {
    const onClose = jest.fn();
    const { container } = render(
      <Toast message="Test message" id="1" onClose={onClose} closeOnClick={true} />
    );

    const toastElement = getToastElement(container);

    // Click the toast to start the closing process
    act(() => {
      fireEvent.click(toastElement);
    });

    // Wait for the next frame to ensure the state has been updated
    act(() => {
      jest.runOnlyPendingTimers();
    });

    // Trigger the opacity transition end
    act(() => {
      fireEvent.transitionEnd(toastElement, {
        propertyName: 'opacity',
      });
    });

    expect(onClose).toHaveBeenCalled();
  });

  it('does not call onClose when clicked and closeOnClick is false', () => {
    const onClose = jest.fn();
    const { container } = render(
      <Toast message="Test message" id="1" onClose={onClose} closeOnClick={false} />
    );

    const toastElement = getToastElement(container);

    act(() => {
      fireEvent.click(toastElement);
    });

    act(() => {
      jest.runOnlyPendingTimers();
    });

    act(() => {
      fireEvent.transitionEnd(toastElement, {
        propertyName: 'opacity',
      });
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('pauses timer on hover when pauseOnHover is true', () => {
    const onClose = jest.fn();
    const { container } = render(
      <Toast message="Test message" id="1" onClose={onClose} pauseOnHover={true} duration={1000} />
    );

    const toastElement = getToastElement(container);

    // Hover over toast
    act(() => {
      fireEvent.mouseEnter(toastElement);
    });

    // Advance timer while hovering
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    // Toast should not be closed while hovering
    expect(onClose).not.toHaveBeenCalled();

    // Mouse leave
    act(() => {
      fireEvent.mouseLeave(toastElement);
    });

    // Advance timer after mouse leave
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    // Wait for the next frame
    act(() => {
      jest.runOnlyPendingTimers();
    });

    // Trigger the opacity transition end
    act(() => {
      fireEvent.transitionEnd(toastElement, {
        propertyName: 'opacity',
      });
    });

    // Toast should be closed
    expect(onClose).toHaveBeenCalled();
  });

  it('supports RTL mode', () => {
    const { container } = render(<Toast message="Test message" id="1" rtl={true} />);
    expect(getToastElement(container)).toHaveClass('rtl');
  });

  it('shows progress bar when enabled', () => {
    const { container } = render(
      <Toast message="Test message" id="1" progressBar={true} duration={5000} />
    );
    expect(container.querySelector('.toast-progress')).toBeInTheDocument();
  });

  it('hides progress bar when disabled', () => {
    const { container } = render(<Toast message="Test message" id="1" progressBar={false} />);
    expect(container.querySelector('.toast-progress')).not.toBeInTheDocument();
  });

  it('respects isPaused prop', () => {
    const onClose = jest.fn();
    const { container } = render(
      <Toast message="Test message" id="1" onClose={onClose} duration={1000} isPaused={true} />
    );

    const toastElement = getToastElement(container);
    expect(toastElement).toBeInTheDocument();

    // Advance timer while paused
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    // Toast should not be closed while paused
    expect(onClose).not.toHaveBeenCalled();
  });
});
