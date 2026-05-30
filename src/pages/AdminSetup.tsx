import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Mail, Lock, User, Clock } from 'lucide-react';
import { BrandAccents, BrandDots } from '../components/BrandAccents';

interface AdminSetupProps {
  onComplete: () => void;
}

export function AdminSetup({ onComplete }: AdminSetupProps) {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function checkExistingAdmin() {
      const { data } = await supabase.from('admins').select('id').limit(1);
      if (data && data.length > 0) {
        window.location.hash = '#/admin';
        return;
      }
      setChecking(false);
    }
    checkExistingAdmin();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
    });

    if (signUpError) {
      if (signUpError.message === 'Invalid API key' || signUpError.message.includes('already registered')) {
        setError('An account with this email already exists. Please go to Admin Login instead.');
      } else {
        setError(signUpError.message);
      }
      setLoading(false);
      return;
    }

    if (data.user) {
      const { error: adminError } = await supabase.from('admins').insert({
        id: data.user.id,
        email: form.email,
        name: form.name,
      });

      if (adminError) {
        setError(adminError.message);
        setLoading(false);
        return;
      }
    }

    onComplete();
    setLoading(false);
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-moja-bg flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-moja-blue border-t-transparent rounded-full animate-spin" />
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
          <h1 className="text-3xl font-bold text-moja-blue">Admin Setup</h1>
          <p className="text-moja-blue/60 mt-1 font-semibold">Create the first admin account</p>
          <BrandDots className="justify-center mt-3" />
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-semibold">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-bold text-moja-blue mb-2">Your Name</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-moja-blue/40" />
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full h-[60px] pl-12 pr-4 text-lg font-semibold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-orange focus:outline-none focus:ring-2 focus:ring-moja-orange/20 transition-all"
                placeholder="Admin Name"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-moja-blue mb-2">Email</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-moja-blue/40" />
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
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
                value={form.password}
                onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
                className="w-full h-[60px] pl-12 pr-4 text-lg font-semibold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-orange focus:outline-none focus:ring-2 focus:ring-moja-orange/20 transition-all"
                placeholder="Minimum 6 characters"
                minLength={6}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-[70px] bg-moja-orange hover:bg-moja-orange/90 active:scale-[0.98] text-white font-bold text-lg rounded-xl transition-all disabled:opacity-50 touch-manipulation"
          >
            {loading ? 'Creating Admin...' : 'Create Admin Account'}
          </button>
        </form>
      </div>
    </div>
  );
}
