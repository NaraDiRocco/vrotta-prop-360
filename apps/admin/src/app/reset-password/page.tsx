import { isMockMode } from '@/lib/data/repo.ts';
import { AuthLayout } from '@/components/auth/auth-layout.tsx';
import { ResetPasswordForm } from './reset-password-form.tsx';

export default async function ResetPasswordPage() {
  return (
    <AuthLayout title="Elegí una contraseña nueva">
      <ResetPasswordForm mock={isMockMode()} />
    </AuthLayout>
  );
}
