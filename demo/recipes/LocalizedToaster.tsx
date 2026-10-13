import { Toaster } from 'react-elegant-toasts';

// The Toaster's labels are the text it gives assistive technology. Each one is optional: a label
// left out keeps its English default. The prefixes are read before warning and error toasts and
// never shown. Set the page's `lang` too (here `<html lang="de">`), so screen readers pronounce
// the labels and your toasts in the right language.
export function LocalizedToaster() {
  return (
    <Toaster
      labels={{
        region: 'Benachrichtigungen',
        close: 'Benachrichtigung schließen',
        warningPrefix: 'Warnung:',
        errorPrefix: 'Fehler:',
      }}
    />
  );
}
