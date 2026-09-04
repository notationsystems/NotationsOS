import { redirect } from 'next/navigation';

/** The product first: the corpus and its releases. */
export default function Home() {
  redirect('/releases');
}
