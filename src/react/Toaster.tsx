import { useEffect, useState, type ReactElement } from 'react';
import { attach, configure } from '../store/store';
import type { ToasterToken } from '../store/types';
import type { ToasterProps } from '../types';

const createToken = (): ToasterToken => ({});

// Attaches this Toaster to the store, which decides which mounted Toaster is active (§8.5).
// Rendering arrives in P-14: until then the Toaster produces no DOM output.
export const Toaster: (props: ToasterProps) => ReactElement | null = ({
  maxVisible,
}: ToasterProps) => {
  const [token] = useState(createToken);
  // Configured before attaching, so the first promotion already uses this Toaster's limit. The
  // attach effect depends only on the token: changing a prop never detaches or re-queues.
  useEffect(() => {
    configure(token, { maxVisible });
  }, [token, maxVisible]);
  useEffect(() => attach(token), [token]);
  return null;
};
