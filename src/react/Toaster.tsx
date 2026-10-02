import type { ReactElement } from 'react';
import type { ToasterProps } from '../types';

// P-08 skeleton: the props are final, but the Toaster renders nothing until P-14.
export const Toaster: (props: ToasterProps) => ReactElement | null = () => null;
