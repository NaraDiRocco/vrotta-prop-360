import { isMockMode } from '@/lib/data/repo.ts';
import { LoginForm } from './login-form.tsx';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = typeof params['next'] === 'string' ? params['next'] : '/';
  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', padding: 24 }}>
      <div style={{ width: 320 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Recorrido 360</h1>
        <p style={{ color: 'var(--fg-muted)', marginBottom: 16 }}>Panel de administración</p>
        <LoginForm next={next} mock={isMockMode()} />
      </div>
    </main>
  );
}
