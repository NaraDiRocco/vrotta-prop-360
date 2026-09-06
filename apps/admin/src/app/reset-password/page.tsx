import { isMockMode } from '@/lib/data/repo.ts';
import { ResetPasswordForm } from './reset-password-form.tsx';

export default async function ResetPasswordPage() {
  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', padding: 24 }}>
      <div style={{ width: 320 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Vrotta Prop 360</h1>
        <p style={{ color: 'var(--fg-muted)', marginBottom: 16 }}>Elegir una contraseña nueva</p>
        <ResetPasswordForm mock={isMockMode()} />
      </div>
    </main>
  );
}
