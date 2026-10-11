// A Server Component (§23, P-23 D0-7): it imports the stylesheet and renders <Toaster />, which
// crosses the package's "use client" boundary. Only public entry points are used.
import 'react-elegant-toasts/styles.css';
import type { ReactNode } from 'react';
import { Toaster } from 'react-elegant-toasts';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster position="bottom-center" />
      </body>
    </html>
  );
}
