export type ToastType = 'success' | 'error' | 'info' | 'warning';

export type ToastPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export type ToastAnimation = 'slide' | 'fade' | 'zoom' | 'bounce';

export interface ToastProps {
  id: string;
  type?: ToastType;
  title?: string;
  message: string;
  duration?: number;
  position?: ToastPosition;
  animation?: ToastAnimation;
  onClose?: () => void;
  pauseOnHover?: boolean;
  closeOnClick?: boolean;
  className?: string;
  style?: React.CSSProperties;
  icon?: React.ReactNode;
  progressBar?: boolean;
  rtl?: boolean;
  role?: string;
}

export interface ToastContextValue {
  addToast: (toast: Omit<ToastProps, 'id'>) => string;
  removeToast: (id: string) => void;
  removeAll: () => void;
  updateToast: (id: string, toast: Partial<ToastProps>) => void;
}

export interface ToastProviderProps {
  children: React.ReactNode;
  defaultPosition?: ToastPosition;
  defaultAnimation?: ToastAnimation;
  defaultDuration?: number;
  maxToasts?: number;
  containerClassName?: string;
  containerStyle?: React.CSSProperties;
  pauseOnPageIdle?: boolean;
  pauseOnFocusLoss?: boolean;
}
