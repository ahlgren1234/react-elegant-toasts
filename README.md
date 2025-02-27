# React Elegant Toasts

![npm](https://img.shields.io/npm/v/react-elegant-toasts)
![npm bundle size](https://img.shields.io/bundlephobia/minzip/react-elegant-toasts)
![npm](https://img.shields.io/npm/dt/react-elegant-toasts)
![GitHub](https://img.shields.io/github/license/yourusername/react-elegant-toasts)

A highly customizable, accessible, and elegant toast notification system for React applications. Built with TypeScript and modern React practices.

## Features

- 🎨 Highly customizable appearance
- 🎭 Multiple animation types (slide, fade, zoom, bounce)
- 📍 6 different positions
- ⌛ Progress bar with pause on hover
- 🌓 Dark mode support
- ♿ Accessibility features (ARIA roles, keyboard navigation)
- 🔄 RTL support
- ⚡ Lightweight (~3.5KB gzipped)
- 📱 Responsive design
- 🎯 TypeScript support
- 🧪 Fully tested

## Installation

```bash
npm install react-elegant-toasts
# or
yarn add react-elegant-toasts
# or
pnpm add react-elegant-toasts
```

## Quick Start

```tsx
import { ToastProvider, useToast } from 'react-elegant-toasts';
import 'react-elegant-toasts/dist/styles.css';

// Wrap your app with ToastProvider
function App() {
  return (
    <ToastProvider>
      <YourApp />
    </ToastProvider>
  );
}

// Use in your components
function YourComponent() {
  const toast = useToast();

  const showToast = () => {
    toast.addToast({
      type: 'success',
      title: 'Success!',
      message: 'Operation completed successfully',
    });
  };

  return <button onClick={showToast}>Show Toast</button>;
}
```

## Advanced Usage

### Provider Configuration

```tsx
<ToastProvider
  defaultPosition="top-right"
  defaultAnimation="slide"
  defaultDuration={5000}
  maxToasts={5}
  pauseOnPageIdle={true}
  pauseOnFocusLoss={true}
  containerClassName="my-toasts"
  containerStyle={{ zIndex: 9999 }}
>
  <YourApp />
</ToastProvider>
```

### Toast Options

```tsx
// Basic toast
toast.addToast({
  message: 'Simple notification'
});

// Full configuration
toast.addToast({
  type: 'success',
  title: 'Custom Toast',
  message: 'This is a fully customized toast',
  position: 'bottom-right',
  animation: 'bounce',
  duration: 8000,
  pauseOnHover: true,
  closeOnClick: true,
  progressBar: true,
  rtl: false,
  className: 'my-toast',
  style: { backgroundColor: '#4caf50' },
  icon: <CustomIcon />,
  role: 'alert'
});

// Update existing toast
const id = toast.addToast({ message: 'Loading...' });
// ... after some operation
toast.updateToast(id, { 
  type: 'success',
  message: 'Operation completed!' 
});

// Remove specific toast
toast.removeToast(id);

// Remove all toasts
toast.removeAll();
```

### Toast Types

```tsx
// Success toast
toast.addToast({
  type: 'success',
  title: 'Success',
  message: 'Operation completed successfully'
});

// Error toast
toast.addToast({
  type: 'error',
  title: 'Error',
  message: 'Something went wrong'
});

// Warning toast
toast.addToast({
  type: 'warning',
  title: 'Warning',
  message: 'Please check your input'
});

// Info toast
toast.addToast({
  type: 'info',
  title: 'Info',
  message: 'New updates available'
});
```

### Animations

```tsx
// Slide animation
toast.addToast({
  animation: 'slide',
  message: 'Sliding notification'
});

// Fade animation
toast.addToast({
  animation: 'fade',
  message: 'Fading notification'
});

// Zoom animation
toast.addToast({
  animation: 'zoom',
  message: 'Zooming notification'
});

// Bounce animation
toast.addToast({
  animation: 'bounce',
  message: 'Bouncing notification'
});
```

### Custom Styling

```css
/* Override default styles */
.toast {
  /* Custom toast container styles */
}

.toast.success {
  /* Custom success toast styles */
}

.toast-title {
  /* Custom title styles */
}

.toast-message {
  /* Custom message styles */
}

.toast-progress {
  /* Custom progress bar styles */
}

/* Dark mode overrides */
@media (prefers-color-scheme: dark) {
  .toast {
    /* Dark mode styles */
  }
}
```

### TypeScript Support

```tsx
import type { 
  ToastProps, 
  ToastPosition, 
  ToastType, 
  ToastAnimation 
} from 'react-elegant-toasts';

// Use in your code
const position: ToastPosition = 'top-right';
const type: ToastType = 'success';
const animation: ToastAnimation = 'slide';
```

### Usage with Next.js

```tsx
// app/providers.tsx
'use client';

import { ToastProvider } from 'react-elegant-toasts';
import 'react-elegant-toasts/dist/styles.css';

export function Providers({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

// app/layout.tsx
import { Providers } from './providers';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

### Usage with Remix

```tsx
// app/root.tsx
import { ToastProvider } from 'react-elegant-toasts';
import toastStyles from 'react-elegant-toasts/dist/styles.css';

export const links: LinksFunction = () => [
  { rel: 'stylesheet', href: toastStyles }
];

export default function App() {
  return (
    <html>
      <body>
        <ToastProvider>
          <Outlet />
        </ToastProvider>
      </body>
    </html>
  );
}
```

## API Reference

### ToastProvider Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| defaultPosition | ToastPosition | 'top-right' | Default position for toasts |
| defaultAnimation | ToastAnimation | 'slide' | Default animation type |
| defaultDuration | number | 5000 | Default duration in milliseconds |
| maxToasts | number | 5 | Maximum number of toasts shown at once |
| containerClassName | string | undefined | Custom class for the container |
| containerStyle | CSSProperties | undefined | Custom styles for the container |
| pauseOnPageIdle | boolean | true | Pause toasts when page is idle |
| pauseOnFocusLoss | boolean | true | Pause toasts when window loses focus |

### Toast Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| type | ToastType | 'info' | Type of toast |
| title | string | undefined | Toast title |
| message | string | required | Toast message |
| position | ToastPosition | 'top-right' | Toast position |
| animation | ToastAnimation | 'slide' | Animation type |
| duration | number | 5000 | Duration in milliseconds |
| pauseOnHover | boolean | true | Pause timer on hover |
| closeOnClick | boolean | true | Close toast on click |
| progressBar | boolean | true | Show progress bar |
| rtl | boolean | false | Right-to-left support |
| className | string | undefined | Custom class name |
| style | CSSProperties | undefined | Custom styles |
| icon | ReactNode | undefined | Custom icon |
| role | string | 'alert' | ARIA role |

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Opera (latest)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

MIT © [Your Name]

## Acknowledgments

- Inspired by the best practices of toast notifications
- Built with accessibility in mind
- Designed for modern React applications 