import { useState, useEffect } from 'react';
import { Bug, CheckCircle, XCircle, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface BugReport {
  id: string;
  description: string;
  page: string | null;
  reporter_name: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
}

export function BugReports() {
  const [reports, setReports] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved' | 'dismissed'>('open');

  useEffect(() => {
    fetchReports();
  }, []);

  async function fetchReports() {
    const { data } = await supabase
      .from('bug_reports')
      .select('*')
      .order('created_at', { ascending: false });
    setReports(data || []);
    setLoading(false);
  }

  async function updateStatus(id: string, status: string) {
    await supabase
      .from('bug_reports')
      .update({
        status,
        resolved_at: status === 'resolved' ? new Date().toISOString() : null,
      })
      .eq('id', id);
    fetchReports();
  }

  async function deleteReport(id: string) {
    await supabase.from('bug_reports').delete().eq('id', id);
    fetchReports();
  }

  const filtered = filter === 'all' ? reports : reports.filter(r => r.status === filter);
  const openCount = reports.filter(r => r.status === 'open').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-3 border-moja-aqua border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
            <Bug className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-moja-blue">Bug Reports</h2>
            <p className="text-sm text-moja-blue/50">{openCount} open {openCount === 1 ? 'report' : 'reports'}</p>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        {(['open', 'resolved', 'dismissed', 'all'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition-colors capitalize ${
              filter === f
                ? 'bg-moja-blue text-white'
                : 'bg-white text-moja-blue/60 hover:bg-moja-blue/5'
            }`}
          >
            {f}
            {f === 'open' && openCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-red-500 text-white">{openCount}</span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <Bug className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-moja-blue/40 font-semibold">No {filter !== 'all' ? filter : ''} bug reports</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(report => (
            <div
              key={report.id}
              className={`bg-white rounded-xl border p-5 transition-all ${
                report.status === 'open' ? 'border-red-200 shadow-sm' : 'border-gray-100'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-moja-blue font-medium whitespace-pre-wrap">{report.description}</p>
                  <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-moja-blue/40">
                    {report.reporter_name && (
                      <span className="font-semibold text-moja-blue/60">
                        {report.reporter_name}
                      </span>
                    )}
                    <span>
                      {new Date(report.created_at).toLocaleDateString('en-US', {
                        timeZone: 'America/New_York',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                    {report.page && (
                      <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">{report.page}</span>
                    )}
                    <span className={`px-2 py-0.5 rounded-full font-bold capitalize ${
                      report.status === 'open' ? 'bg-red-100 text-red-600' :
                      report.status === 'resolved' ? 'bg-green-100 text-green-600' :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      {report.status}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {report.status === 'open' && (
                    <>
                      <button
                        onClick={() => updateStatus(report.id, 'resolved')}
                        className="p-2 text-green-500 hover:bg-green-50 rounded-lg transition-colors"
                        title="Mark resolved"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => updateStatus(report.id, 'dismissed')}
                        className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Dismiss"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  {report.status !== 'open' && (
                    <button
                      onClick={() => updateStatus(report.id, 'open')}
                      className="p-2 text-moja-blue/40 hover:bg-moja-blue/5 rounded-lg transition-colors text-xs font-bold"
                      title="Reopen"
                    >
                      Reopen
                    </button>
                  )}
                  <button
                    onClick={() => deleteReport(report.id)}
                    className="p-2 text-red-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
