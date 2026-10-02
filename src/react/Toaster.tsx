import { useEffect, useState, type ReactElement } from 'react';
import { attach } from '../store/store';
import type { ToasterToken } from '../store/types';
import type { ToasterProps } from '../types';

const createToken = (): ToasterToken => ({});

// Attaches this Toaster to the store, which decides which mounted Toaster is active (§8.5).
// Rendering arrives in P-14: until then the Toaster produces no DOM output.
export const Toaster: (props: ToasterProps) => ReactElement | null = () => {
  const [token] = useState(createToken);
  useEffect(() => attach(token), [token]);
  return null;
};
