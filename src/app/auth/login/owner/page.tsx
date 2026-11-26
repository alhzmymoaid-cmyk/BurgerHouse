import { redirect } from 'next/navigation';

export default function LegacyLoginRedirect() {
  redirect('/owner-studio/login');
}
