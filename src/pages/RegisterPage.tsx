import { useState, useEffect } from 'react';
import { callEdgeFunction } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import { CheckCircle, Clock } from 'lucide-react';
import { Toast } from '../components/Toast';
import { BrandAccents, BrandDots } from '../components/BrandAccents';

interface RegisterPageProps {
  token: string;
}

export function RegisterPage({ token }: RegisterPageProps) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', pin: '', confirmPin: '' });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [valid, setValid] = useState(false);
  const [success, setSuccess] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    validateToken();
  }, [token]);

  async function validateToken() {
    const { data } = await supabase
      .from('invitations')
      .select('email')
      .eq('token', token)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (data) {
      setValid(true);
      setForm(f => ({ ...f, email: data.email }));
    }
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (form.pin.length !== 4 || !/^\d{4}$/.test(form.pin)) {
      setToast({ message: 'PIN must be exactly 4 digits', type: 'error' });
      return;
    }

    if (form.pin !== form.confirmPin) {
      setToast({ message: 'PINs do not match', type: 'error' });
      return;
    }

    setSubmitting(true);
    const result = await callEdgeFunction('/register-staff', {
      token,
      name: form.name,
      email: form.email,
      phone: form.phone,
      pin: form.pin,
    });

    if (result.success) {
      setSuccess(true);
    } else {
      setToast({ message: result.message || 'Registration failed', type: 'error' });
    }
    setSubmitting(false);
  }

  if (loading) {
    return <div className="min-h-screen bg-moja-bg" />;
  }

  if (!valid) {
    return (
      <div className="min-h-screen bg-moja-bg relative flex items-center justify-center p-6">
        <BrandAccents />
        <div className="relative z-10 text-center">
          <h1 className="text-2xl font-bold text-moja-blue mb-2">Invalid Invitation</h1>
          <p className="text-moja-blue/60 font-semibold">This invitation link is invalid or has expired.</p>
          <a href="#/" className="inline-block mt-4 text-moja-aqua hover:text-moja-orange font-bold transition-colors">
            Go to Time Clock
          </a>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-moja-bg relative flex items-center justify-center p-6">
        <BrandAccents />
        <div className="relative z-10 text-center max-w-md">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-moja-blue mb-2">Account Created</h1>
          <p className="text-moja-blue/60 font-semibold">Your account is now active. You can use the time clock to clock in and out with your 4-digit PIN.</p>
          <a href="#/" className="inline-block mt-6 px-8 py-4 bg-moja-orange text-white rounded-xl font-bold hover:bg-moja-orange/90 active:scale-[0.98] transition-all touch-manipulation">
            Go to Time Clock
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-moja-bg relative flex items-center justify-center p-6">
      <BrandAccents />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-moja-blue rounded-2xl mb-4">
            <Clock className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-moja-blue">Create Your Account</h1>
          <p className="text-moja-blue/60 mt-1 font-semibold">Moja Behavioral Services</p>
          <BrandDots className="justify-center mt-3" />
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 space-y-5">
          <div>
            <label className="block text-sm font-bold text-moja-blue mb-1">Full Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full h-[60px] px-4 text-lg font-semibold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-orange focus:outline-none focus:ring-2 focus:ring-moja-orange/20"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-moja-blue mb-1">Email *</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
              className="w-full h-[60px] px-4 text-lg font-semibold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-orange focus:outline-none focus:ring-2 focus:ring-moja-orange/20"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-moja-blue mb-1">Phone (optional)</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
              className="w-full h-[60px] px-4 text-lg font-semibold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-orange focus:outline-none focus:ring-2 focus:ring-moja-orange/20"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-moja-blue mb-1">4-Digit PIN *</label>
            <input
              type="password"
              value={form.pin}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                setForm(f => ({ ...f, pin: v }));
              }}
              maxLength={4}
              className="w-full h-[60px] px-4 text-2xl text-center font-mono tracking-[0.5em] font-bold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-orange focus:outline-none focus:ring-2 focus:ring-moja-orange/20"
              placeholder="----"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-moja-blue mb-1">Confirm PIN *</label>
            <input
              type="password"
              value={form.confirmPin}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                setForm(f => ({ ...f, confirmPin: v }));
              }}
              maxLength={4}
              className="w-full h-[60px] px-4 text-2xl text-center font-mono tracking-[0.5em] font-bold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-orange focus:outline-none focus:ring-2 focus:ring-moja-orange/20"
              placeholder="----"
              required
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-[70px] bg-moja-orange hover:bg-moja-orange/90 active:scale-[0.98] text-white font-bold text-lg rounded-xl transition-all disabled:opacity-50 touch-manipulation"
          >
            {submitting ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}
