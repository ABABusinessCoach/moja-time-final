import { useState, useEffect } from 'react';
import { supabase, callEdgeFunction } from '../lib/supabase';
import type { Invitation } from '../lib/types';
import { Send, Copy, CheckCircle, Clock, XCircle } from 'lucide-react';
import { Toast } from '../components/Toast';

export function Invitations() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    loadInvitations();
  }, []);

  async function loadInvitations() {
    const { data } = await supabase
      .from('invitations')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setInvitations(data);
    setLoading(false);
  }

  async function createInvitation(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setSending(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setToast({ message: 'Not authenticated', type: 'error' });
      setSending(false);
      return;
    }

    const { error } = await supabase.from('invitations').insert({
      email,
      created_by: user.id,
    });

    if (error) {
      setToast({ message: error.message, type: 'error' });
      setSending(false);
      return;
    }

    // Get the newly created invitation to build the link
    const { data: newInv } = await supabase
      .from('invitations')
      .select('token')
      .eq('email', email)
      .eq('used', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (newInv) {
      const appUrl = import.meta.env.VITE_APP_URL || window.location.origin;
      const invitationLink = `${appUrl}#/register/${newInv.token}`;
      const { data: { session } } = await supabase.auth.getSession();
      const emailResult = await callEdgeFunction('/send-invitation', {
        email,
        invitation_link: invitationLink,
      }, session?.access_token);

      if (emailResult.success) {
        setToast({ message: `Invitation email sent to ${email}`, type: 'success' });
      } else {
        setToast({ message: `Invitation created but email failed: ${emailResult.message}`, type: 'error' });
      }
    } else {
      setToast({ message: `Invitation created for ${email}`, type: 'success' });
    }

    setEmail('');
    loadInvitations();
    setSending(false);
  }

  function getInvitationLink(token: string): string {
    const appUrl = import.meta.env.VITE_APP_URL || window.location.origin;
    return `${appUrl}#/register/${token}`;
  }

  async function copyLink(token: string) {
    await navigator.clipboard.writeText(getInvitationLink(token));
    setToast({ message: 'Link copied to clipboard', type: 'success' });
  }

  function getStatus(inv: Invitation): { label: string; color: string; icon: React.ReactNode } {
    if (inv.used) return { label: 'Used', color: 'bg-moja-aqua/15 text-moja-aqua', icon: <CheckCircle className="w-3 h-3" /> };
    if (new Date(inv.expires_at) < new Date()) return { label: 'Expired', color: 'bg-red-50 text-red-600', icon: <XCircle className="w-3 h-3" /> };
    return { label: 'Pending', color: 'bg-moja-yellow/20 text-moja-blue', icon: <Clock className="w-3 h-3" /> };
  }

  if (loading) {
    return null;
  }

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Create Invitation */}
      <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
        <h3 className="text-xl font-bold text-moja-blue mb-4">Send Invitation</h3>
        <form onSubmit={createInvitation} className="flex gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="staff@moja.com"
            className="flex-1 h-14 px-4 text-lg font-semibold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-orange focus:outline-none focus:ring-2 focus:ring-moja-orange/20"
            required
          />
          <button
            type="submit"
            disabled={sending}
            className="inline-flex items-center gap-2 px-6 h-14 bg-moja-orange text-white rounded-xl font-bold hover:bg-moja-orange/90 active:scale-[0.98] transition-all disabled:opacity-50 touch-manipulation"
          >
            <Send className="w-4 h-4" />
            {sending ? 'Creating...' : 'Create Invite'}
          </button>
        </form>
        <p className="text-sm text-moja-blue/50 font-semibold mt-3">
          An invitation link will be generated. Share it with the staff member to let them set up their account.
        </p>
      </div>

      {/* Invitations List */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-xl font-bold text-moja-blue">All Invitations</h3>
        </div>
        {invitations.length === 0 ? (
          <div className="p-8 text-center text-moja-blue/40 font-semibold">No invitations sent yet</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {invitations.map(inv => {
              const status = getStatus(inv);
              return (
                <div key={inv.id} className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-moja-blue">{inv.email}</div>
                    <div className="text-sm font-semibold text-moja-blue/40">
                      Created {new Date(inv.created_at).toLocaleDateString('en-US', { timeZone: 'America/New_York' })} | Expires {new Date(inv.expires_at).toLocaleDateString('en-US', { timeZone: 'America/New_York' })}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-full ${status.color}`}>
                      {status.icon}
                      {status.label}
                    </span>
                    {!inv.used && new Date(inv.expires_at) > new Date() && (
                      <button
                        onClick={() => copyLink(inv.token)}
                        className="p-2.5 text-moja-blue/40 hover:text-moja-aqua hover:bg-moja-aqua/10 rounded-lg transition-colors"
                        title="Copy link"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
