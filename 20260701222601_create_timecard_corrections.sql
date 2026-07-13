import { useState } from 'react';
import { Bug, X, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function BugReportButton() {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const currentPage = window.location.hash || '#/';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;

    setSubmitting(true);
    const { error } = await supabase.from('bug_reports').insert({
      description: description.trim(),
      page: currentPage,
      reporter_name: name.trim() || null,
    });

    setSubmitting(false);

    if (!error) {
      setSuccess(true);
      setTimeout(() => {
        setOpen(false);
        setDescription('');
        setName('');
        setSuccess(false);
      }, 2000);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-[9990] w-12 h-12 bg-moja-blue hover:bg-moja-blue/90 text-white rounded-full shadow-lg hover:shadow-xl flex items-center justify-center transition-all active:scale-95 group"
        title="Report a bug"
      >
        <Bug className="w-5 h-5 group-hover:rotate-12 transition-transform" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[9995] flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-slide-in">
            <div className="bg-moja-blue px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bug className="w-5 h-5 text-moja-aqua" />
                <h2 className="text-white font-bold text-lg">Report a Bug</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-white/60 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {success ? (
              <div className="p-8 text-center">
                <div className="w-16 h-16 mx-auto rounded-full bg-green-100 flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-lg font-bold text-moja-blue">Thanks for the report!</p>
                <p className="text-sm text-moja-blue/60 mt-1">We'll look into this issue.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-bold text-moja-blue mb-1.5">
                    What went wrong?
                  </label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Describe the issue you experienced..."
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-moja-aqua focus:ring-0 outline-none text-sm text-moja-blue placeholder:text-gray-400 resize-none transition-colors"
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-moja-blue mb-1.5">
                    Your name <span className="font-normal text-moja-blue/40">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="So we can follow up with you"
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-moja-aqua focus:ring-0 outline-none text-sm text-moja-blue placeholder:text-gray-400 transition-colors"
                  />
                </div>
                <div className="text-xs text-moja-blue/40 bg-gray-50 rounded-lg px-3 py-2">
                  Page: <span className="font-mono">{currentPage}</span>
                </div>
                <button
                  type="submit"
                  disabled={submitting || !description.trim()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-moja-blue text-white font-bold rounded-xl hover:bg-moja-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                >
                  <Send className="w-4 h-4" />
                  {submitting ? 'Sending...' : 'Submit Report'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
