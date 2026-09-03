import { useState } from 'react';
import { Lock, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { BrandAccents, BrandDots } from '../components/BrandAccents';
import { EDGE_FUNCTION_URL } from '../lib/supabase';

function getResetToken(): string | null {
  const hash = window.location.hash;
  const hashMatch = hash.match(/[?&]token=([^&]+)/);
  if (hashMatch) return hashMatch[1];

  const urlParams = new URLSearchParams(window.location.search);
  const searchToken = urlParams.get('token');
  if (searchToken) return searchToken;

  const fullUrl = window.location.href;
  const tokenMatch = fullUrl.match(/token=([^&#]+)/);
  if (tokenMatch) return tokenMatch[1];

  return null;
}

export function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const token = getResetToken();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!token) {
      setError('Invalid reset link. Please request a new one.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${EDGE_FUNCTION_URL}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || 'Failed to reset password');
      } else {
        setSuccess(true);
      }
    } catch {
      setError('Network error. Please try again.');
    }
    setLoading(false);
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-moja-bg relative flex items-center justify-center p-6">
        <BrandAccents />
        <div className="relative z-10 w-full max-w-md text-center">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 space-y-5">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mx-auto">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-moja-blue">Invalid Reset Link</h2>
            <p className="text-moja-blue/60 font-semibold">This password reset link is invalid or has expired. Please request a new one.</p>
            <a
              href="#/admin"
              className="block w-full h-[60px] leading-[60px] bg-moja-orange hover:bg-moja-orange/90 text-white font-bold text-lg rounded-xl transition-all text-center"
            >
              Back to Login
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-moja-bg relative flex items-center justify-center p-6">
        <BrandAccents />
        <div className="relative z-10 w-full max-w-md text-center">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 space-y-5">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mx-auto">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-moja-blue">Password Updated</h2>
            <p className="text-moja-blue/60 font-semibold">Your password has been reset successfully.</p>
            <a
              href="#/admin"
              className="block w-full h-[60px] leading-[60px] bg-moja-orange hover:bg-moja-orange/90 text-white font-bold text-lg rounded-xl transition-all text-center"
            >
              Go to Admin Login
            </a>
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
          <h1 className="text-3xl font-bold text-moja-blue">New Password</h1>
          <p className="text-moja-blue/60 mt-1 font-semibold">Choose a new password for your account</p>
          <BrandDots className="justify-center mt-3" />
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-semibold">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-bold text-moja-blue mb-2">New Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-moja-blue/40" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-[60px] pl-12 pr-4 text-lg font-semibold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-orange focus:outline-none focus:ring-2 focus:ring-moja-orange/20 transition-all"
                placeholder="At least 6 characters"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-moja-blue mb-2">Confirm Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-moja-blue/40" />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full h-[60px] pl-12 pr-4 text-lg font-semibold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-orange focus:outline-none focus:ring-2 focus:ring-moja-orange/20 transition-all"
                placeholder="Re-enter password"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-[70px] bg-moja-orange hover:bg-moja-orange/90 active:scale-[0.98] text-white font-bold text-lg rounded-xl transition-all disabled:opacity-50 touch-manipulation"
          >
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
