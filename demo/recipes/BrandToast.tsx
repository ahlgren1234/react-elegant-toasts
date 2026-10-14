import { toast } from 'react-elegant-toasts';
import './brand-toast.css';

// A built-in success toast in your brand's colours. The `className` option adds a class to the
// toast's root element, and brand-toast.css sets the library's public tokens on that class. The
// card, its icon, action, progress strip and focus rings all read those tokens, so they follow,
// and no internal markup needs a selector of its own. Other toasts keep the defaults.

/** Shows the published confirmation, with an Undo action and the progress strip. */
export function showBrandToast() {
  return toast.success('Your site is live', {
    description: 'Visitors now see the version you published.',
    action: { label: 'Undo', onClick: () => toast('Publishing undone') },
    duration: 8000,
    progress: true,
    className: 'brand-toast',
  });
}
