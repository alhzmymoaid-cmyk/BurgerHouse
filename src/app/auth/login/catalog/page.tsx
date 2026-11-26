import { redirect } from 'next/navigation';

export default function LegacyLoginRedirect() {
  redirect('/catalog-studio/login');
}
