// A Server Component page that renders the client components below.
import { ShowProgressToast, ShowToast } from './show-toast';

export default function Page() {
  return (
    <main>
      <h1>consumer-next</h1>
      <ShowToast />
      <ShowProgressToast />
    </main>
  );
}
