import { redirect } from 'next/navigation';

export default function LegacyLoginRedirect() {
  redirect('/bh-sovereign-vault/login');
}
