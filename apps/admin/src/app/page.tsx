import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth.ts';

export default async function Home() {
  const session = await getSession();
  if (!session) redirect('/login');
  const first = session.memberships[0];
  if (!first) redirect('/login?error=sin-tenant');
  if (first.role === 'sales') redirect(`/s/t/${first.tenantSlug}`);
  redirect(`/t/${first.tenantSlug}/p`);
}
