import { redirect } from 'next/navigation';

// Keep old bookmarks working without exposing the retired admin interface.
export default function LegacyAdmin() {
  redirect('/admin');
}
