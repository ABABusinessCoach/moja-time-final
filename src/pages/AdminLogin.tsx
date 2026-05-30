import { useState } from 'react';
import { Mail, Lock, Clock } from 'lucide-react';
import { BrandAccents, BrandDots } from '../components/BrandAccents';

interface AdminLoginProps {
  onLogin: (email: string, password: string) => Promise<{ error: unknown }>;
}

export function AdminLogin({ onLogin }: AdminLoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
