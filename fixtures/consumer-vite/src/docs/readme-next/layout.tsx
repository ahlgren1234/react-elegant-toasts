// The README's Next.js App Router layout (P-26 S4), the pattern the Next.js consumer fixture (N1)
// builds and serves: a Server Component that imports the stylesheet and renders <Toaster />.
// Type-checked here in F1 to F4; never imported.

// #region readme-next-layout
// app/layout.tsx
import 'react-elegant-toasts/styles.css';
import type { ReactNode } from 'react';
import { Toaster } from 'react-elegant-toasts';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
// #endregion
