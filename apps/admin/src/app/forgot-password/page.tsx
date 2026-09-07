import { isMockMode } from '@/lib/data/repo.ts';
import { AuthLayout } from '@/components/auth/auth-layout.tsx';
import { ForgotPasswordForm } from './forgot-password-form.tsx';

export default async function ForgotPasswordPage() {
  return (
    <AuthLayout title="Recuperá tu contraseña" description="Te mandamos un enlace para elegir una nueva.">
      <ForgotPasswordForm mock={isMockMode()} />
    </AuthLayout>
  );
}
