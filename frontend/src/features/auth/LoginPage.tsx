import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useAuth } from '@/auth/useAuth';
import { extractErrorMessage } from '@/api/client';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const { login, isAuthenticated, isInitializing } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  if (!isInitializing && isAuthenticated) {
    const redirectTo = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/clients';
    return <Navigate to={redirectTo} replace />;
  }

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setSubmitting(true);
    try {
      await login(email, password);
      toast.success('Signed in');
      const redirectTo = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/clients';
      navigate(redirectTo, { replace: true });
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Sign-in failed'));
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-brand-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="text-2xl font-bold text-brand-800">Windbrook</div>
          <div className="text-sm text-slate-500">Client Report Portal</div>
        </div>
        <form onSubmit={onSubmit} className="card space-y-4">
          <h1 className="text-lg font-semibold text-slate-900">Sign in</h1>
          <div>
            <label htmlFor="email" className="label">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              className="input"
              {...register('email')}
            />
            {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
          </div>
          <div>
            <label htmlFor="password" className="label">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="input"
              {...register('password')}
            />
            {errors.password && (
              <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
            )}
          </div>
          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="text-xs text-slate-500">
            Internal use only. All activity is logged.
          </p>
        </form>
      </div>
    </div>
  );
}
