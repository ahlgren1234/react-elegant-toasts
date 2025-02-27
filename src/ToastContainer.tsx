import React from 'react';
import { ToastProps } from './types';
import Toast from './Toast';
import { getPositionStyle } from './utils';

interface ToastContainerProps {
  toasts: ToastProps[];
  onRemove: (id: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

const ToastContainer: React.FC<ToastContainerProps> = ({
  toasts,
  onRemove,
  className = '',
  style,
}) => {
  const positionGroups = toasts.reduce((groups: { [key: string]: ToastProps[] }, toast) => {
    const position = toast.position || 'top-right';
    if (!groups[position]) {
      groups[position] = [];
    }
    groups[position].push(toast);
    return groups;
  }, {});

  return (
    <>
      {Object.entries(positionGroups).map(([position, positionToasts]) => (
        <div
          key={position}
          className={`toast-container ${position} ${className}`}
          style={{
            position: 'fixed',
            padding: '12px',
            zIndex: 9999,
            pointerEvents: 'none',
            ...getPositionStyle(position),
            ...style,
          }}
        >
          {positionToasts.map(toast => (
            <div
              key={toast.id}
              style={{
                pointerEvents: 'auto',
                marginBottom: '8px',
              }}
            >
              <Toast {...toast} onClose={() => onRemove(toast.id)} />
            </div>
          ))}
        </div>
      ))}
    </>
  );
};

export default ToastContainer;
