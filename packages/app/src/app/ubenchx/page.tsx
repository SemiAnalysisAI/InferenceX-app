import { redirect } from 'next/navigation';

/** ubenchX opens on its first test; the shared header's selector switches views. */
export default function UbenchxPage() {
  redirect('/ubenchx/mem-bw');
}
