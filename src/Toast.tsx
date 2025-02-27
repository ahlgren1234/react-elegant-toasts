import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ToastProps } from './types';
import { getAnimationStyle } from './utils';

const Toast: React.FC<ToastProps> = ({
  type = 'info',
  title,
  message,
  duration = 5000,
  animation = 'slide',
  onClose,
  pauseOnHover = true,
  closeOnClick = true,
  className = '',
  style,
  icon,
  progressBar = true,
  rtl = false,
  role = 'alert',
  isPaused = false,
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [progress, setProgress] = useState(100);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const progressTimerRef = useRef<ReturnType<typeof requestAnimationFrame> | undefined>(undefined);

  const getIcon = () => {
    if (icon) return icon;
    switch (type) {
      case 'success':
        return '✓';
      case 'error':
        return '✕';
      case 'warning':
        return '⚠';
      case 'info':
        return 'ℹ';
      default:
        return null;
    }
  };

  const pauseTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    if (progressTimerRef.current) {
      cancelAnimationFrame(progressTimerRef.current);
    }
  }, []);

  const startTimer = useCallback(() => {
    if (duration === Infinity || isPaused) return;

    pauseTimer();

    timerRef.current = setTimeout(() => {
      setIsVisible(false);
    }, duration);

    if (progressBar) {
      const startTime = Date.now();
      const updateProgress = () => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
        setProgress(remaining);

        if (remaining > 0) {
          progressTimerRef.current = requestAnimationFrame(updateProgress);
        }
      };
      progressTimerRef.current = requestAnimationFrame(updateProgress);
    }
  }, [duration, progressBar, pauseTimer, isPaused]);

  useEffect(() => {
    if (!isPaused) {
      startTimer();
    } else {
      pauseTimer();
    }
    return () => {
      pauseTimer();
    };
  }, [startTimer, pauseTimer, isPaused]);

  const handleMouseEnter = useCallback(() => {
    if (pauseOnHover) {
      pauseTimer();
    }
  }, [pauseOnHover, pauseTimer]);

  const handleMouseLeave = useCallback(() => {
    if (pauseOnHover && !isPaused) {
      startTimer();
    }
  }, [pauseOnHover, startTimer, isPaused]);

  const handleClick = useCallback(() => {
    if (closeOnClick) {
      setIsVisible(false);
    }
  }, [closeOnClick]);

  const handleTransitionEnd = useCallback(() => {
    if (!isVisible && onClose) {
      onClose();
    }
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  const animationClass = getAnimationStyle(animation);

  return (
    <div
      role={role}
      className={`toast ${type} ${animationClass} ${className} ${rtl ? 'rtl' : ''}`}
      style={{
        ...style,
        opacity: isVisible ? 1 : 0,
      }}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTransitionEnd={handleTransitionEnd}
    >
      <div className="toast-content">
        {icon !== null && <div className="toast-icon">{getIcon()}</div>}
        <div className="toast-message">
          {title && <div className="toast-title">{title}</div>}
          <div>{message}</div>
        </div>
      </div>
      {progressBar && duration !== Infinity && (
        <div className="toast-progress" style={{ width: `${progress}%` }} />
      )}
    </div>
  );
};

export default Toast;
