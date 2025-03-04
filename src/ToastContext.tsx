import React, { createContext, useContext, useCallback, useState, useEffect } from 'react';
import { ToastContextValue, ToastProps, ToastProviderProps } from './types';
import { generateId } from './utils';
import ToastContainer from './ToastContainer';

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export const ToastProvider: React.FC<ToastProviderProps> = ({
  children,
  defaultPosition = 'top-right',
  defaultAnimation = 'slide',
  defaultDuration = 5000,
  maxToasts = 5,
  containerClassName,
  containerStyle,
  pauseOnPageIdle = true,
  pauseOnFocusLoss = true,
}) => {
  const [toasts, setToasts] = useState<ToastProps[]>([]);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (pauseOnPageIdle) {
      const handleVisibilityChange = () => {
        setIsPaused(document.hidden);
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, [pauseOnPageIdle]);

  useEffect(() => {
    if (pauseOnFocusLoss) {
      const handleFocus = () => setIsPaused(false);
      const handleBlur = () => setIsPaused(true);

      window.addEventListener('focus', handleFocus);
      window.addEventListener('blur', handleBlur);

      return () => {
        window.removeEventListener('focus', handleFocus);
        window.removeEventListener('blur', handleBlur);
      };
    }
  }, [pauseOnFocusLoss]);

  const addToast = useCallback(
    (toast: Omit<ToastProps, 'id'>) => {
      const id = generateId();
      const newToast: ToastProps = {
        id,
        position: defaultPosition,
        animation: defaultAnimation,
        duration: defaultDuration,
        isPaused,
        ...toast,
      };

      setToasts(prevToasts => {
        const updatedToasts = [...prevToasts, newToast];
        if (updatedToasts.length > maxToasts) {
          return updatedToasts.slice(-maxToasts);
        }
        return updatedToasts;
      });

      return id;
    },
    [defaultPosition, defaultAnimation, defaultDuration, maxToasts, isPaused]
  );

  const removeToast = useCallback((id: string) => {
    setToasts(prevToasts => prevToasts.filter(toast => toast.id !== id));
  }, []);

  const updateToast = useCallback((id: string, updates: Partial<ToastProps>) => {
    setToasts(prevToasts =>
      prevToasts.map(toast => (toast.id === id ? { ...toast, ...updates } : toast))
    );
  }, []);

  const removeAll = useCallback(() => {
    setToasts([]);
  }, []);

  useEffect(() => {
    setToasts(prevToasts =>
      prevToasts.map(toast => ({
        ...toast,
        isPaused,
      }))
    );
  }, [isPaused, toasts.length]);

  const contextValue = {
    addToast,
    removeToast,
    updateToast,
    removeAll,
  };

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastContainer
        toasts={toasts}
        onRemove={removeToast}
        className={containerClassName}
        style={containerStyle}
      />
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
