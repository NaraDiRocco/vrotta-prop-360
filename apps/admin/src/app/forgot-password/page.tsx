import { isMockMode } from '@/lib/data/repo.ts';
import { ForgotPasswordForm } from './forgot-password-form.tsx';

export default async function ForgotPasswordPage() {
  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', padding: 24 }}>
      <div style={{ width: 320 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Vrotta Prop 360</h1>
        <p style={{ color: 'var(--fg-muted)', marginBottom: 16 }}>Recuperar contraseña</p>
        <ForgotPasswordForm mock={isMockMode()} />
      </div>
    </main>
  );
}
