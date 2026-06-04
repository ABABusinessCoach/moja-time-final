import { useState } from 'react';
import { Mail, Lock, Clock, ArrowLeft } from 'lucide-react';
import { BrandAccents, BrandDots } from '../components/BrandAccents';
import { EDGE_FUNCTION_URL } from '../lib/supabase';

interface AdminLoginProps {
  onLogin: (email: string, password: string) => Promise<{ error: unknown }>;
}

export function AdminLogin({ onLogin }: AdminLoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await onLogin(email, password);
    if (error) {
      setError('Invalid email or password');
    }
    setLoading(false);
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const appUrl = window.location.origin + window.location.pathname;
      const response = await fetch(`${EDGE_FUNCTION_URL}/request-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail, app_url: appUrl }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || 'Failed to send reset email');
      } else {
        setSuccess('Password reset link sent! Check your email inbox.');
      }
    } catch {
      setError('Network error. Please try again.');
    }
    setLoading(false);
  }

  if (showReset) {
    return (
      <div className="min-h-screen bg-moja-bg relative flex items-center justify-center p-6">
        <BrandAccents />

        <div className="relative z-10 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-moja-blue rounded-2xl mb-4">
              <Clock className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-moja-blue">Reset Password</h1>
            <p className="text-moja-blue/60 mt-1 font-semibold">Enter your email to receive a reset link</p>
            <BrandDots className="justify-center mt-3" />
          </div>

          <form onSubmit={handleResetPassword} className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-semibold">
                {error}
              </div>
            )}
            {success && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm font-semibold">
                {success}
              </div>
            )}

            <div>
              <label className="block text-sm font-bold text-moja-blue mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-moja-blue/40" />
                <input
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className="w-full h-[60px] pl-12 pr-4 text-lg font-semibold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-orange focus:outline-none focus:ring-2 focus:ring-moja-orange/20 transition-all"
                  placeholder="admin@moja.com"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-[70px] bg-moja-orange hover:bg-moja-orange/90 active:scale-[0.98] text-white font-bold text-lg rounded-xl transition-all disabled:opacity-50 touch-manipulation"
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => { setShowReset(false); setError(''); setSuccess(''); }}
              className="inline-flex items-center gap-2 text-sm text-moja-blue/60 hover:text-moja-aqua transition-colors font-semibold"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-moja-bg relative flex items-center justify-center p-6">
      <BrandAccents />

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-moja-blue rounded-2xl mb-4">
            <Clock className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-moja-blue">Admin Login</h1>
          <p className="text-moja-blue/60 mt-1 font-semibold">Moja Behavioral Services</p>
          <BrandDots className="justify-center mt-3" />
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-semibold">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-bold text-moja-blue mb-2">Email</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-moja-blue/40" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-[60px] pl-12 pr-4 text-lg font-semibold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-orange focus:outline-none focus:ring-2 focus:ring-moja-orange/20 transition-all"
                placeholder="admin@moja.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-moja-blue mb-2">Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-moja-blue/40" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-[60px] pl-12 pr-4 text-lg font-semibold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-orange focus:outline-none focus:ring-2 focus:ring-moja-orange/20 transition-all"
                placeholder="Enter password"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-[70px] bg-moja-orange hover:bg-moja-orange/90 active:scale-[0.98] text-white font-bold text-lg rounded-xl transition-all disabled:opacity-50 touch-manipulation"
          >
            {loading ? 'Signing in...' : 'Log In'}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => { setShowReset(true); setResetEmail(email); setError(''); }}
              className="text-sm text-moja-blue/50 hover:text-moja-orange transition-colors font-semibold"
            >
              Forgot password?
            </button>
          </div>
        </form>

        <div className="mt-6 text-center space-y-2">
          <a href="#/" className="block text-sm text-moja-blue/40 hover:text-moja-aqua transition-colors font-semibold">
            Back to Time Clock
          </a>
          <a href="#/admin/setup" className="block text-sm text-moja-aqua hover:text-moja-orange transition-colors font-semibold">
            First time? Set up admin account
          </a>
        </div>
      </div>
    </div>
  );
}
