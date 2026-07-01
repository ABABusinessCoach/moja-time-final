import { useState, useEffect, useRef } from 'react';
import { MessageSquare, CheckCircle, Clock, AlertTriangle, Send, XCircle, FileText, RefreshCw, Coffee, Radio, ChevronRight, ArrowLeft, User } from 'lucide-react';
import { callTimecardFunction } from '../lib/supabase';
import { supabase } from '../lib/supabase';

interface ShiftNote {
  id: string;
  clock_log_id: string | null;
  author_type: 'employee' | 'manager';
  body: string;
  status: 'open' | 'acknowledged' | 'resolved';
  resolution_comment: string | null;
  created_at: string;
  resolved_at: string | null;
}

interface Report {
  id: string;
  staff_id: string;
  total_hours: number;
  overtime_hours: number;
  status: string;
  generated_at: string;
  pay_periods: { start_date: string; end_date: string } | null;
  staff: { name: string; email: string } | null;
  notes?: ShiftNote[];
  shift_count?: number;
  has_open_shift?: boolean;
  live_total_hours?: number;
}

interface Shift {
  id: string;
  clock_in_time: string;
  clock_out_time: string | null;
  duration_minutes: number | null;
  notes: string | null;
}

interface BreakLog {
  clock_log_id: string;
  break_start: string;
  break_end: string | null;
  duration_minutes: number | null;
  break_type: string;
}

interface ReportDetail {
  report: {
    id: string;
    staff_name: string;
    staff_email: string;
    total_hours: number;
    overtime_hours: number;
    status: string;
    pay_period: { start_date: string; end_date: string };
  };
  shifts: Shift[];
  breaks: BreakLog[];
  notes: ShiftNote[];
}

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function TimecardReview() {
  const [reports, setReports] = useState<Report[]>([]);
  const [allReports, setAllReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<ReportDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [resolveNoteId, setResolveNoteId] = useState<string | null>(null);
  const [resolutionText, setResolutionText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [view, setView] = useState<'pending' | 'all'>('pending');
  const [generating, setGenerating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    loadReports();
    pollRef.current = window.setInterval(loadReports, 30000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function getAuthToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  async function loadReports() {
    const token = await getAuthToken();
    const [pending, all] = await Promise.all([
      callTimecardFunction('/pending-review', { authToken: token }),
      callTimecardFunction('/all', { authToken: token }),
    ]);
    if (pending.success) setReports(pending.reports);
    if (all.success) setAllReports(all.reports);
    setLoading(false);
  }

  async function loadDetail(reportId: string) {
    setLoadingDetail(true);
    const token = await getAuthToken();
    const result = await callTimecardFunction(`/detail/${reportId}`, { authToken: token });
    if (result.success) {
      setSelectedReport(result);
    }
    setLoadingDetail(false);
  }

  async function handleResolve(noteId: string, action: 'resolve' | 'dismiss') {
    setSubmitting(true);
    const token = await getAuthToken();
    await callTimecardFunction('/resolve-note', {
      body: { note_id: noteId, resolution_comment: resolutionText.trim() || undefined, action },
      authToken: token,
    });
    setResolveNoteId(null);
    setResolutionText('');
    setSubmitting(false);
    if (selectedReport) {
      await loadDetail(selectedReport.report.id);
    }
    await loadReports();
  }

  async function handleGenerate() {
    setGenerating(true);
    const token = await getAuthToken();
    const result = await callTimecardFunction('/generate', {
      body: {},
      authToken: token,
    });
    setGenerating(false);
    if (result.success) {
      setToast(`Generated ${result.reports_generated} report(s)`);
      setTimeout(() => setToast(null), 4000);
      await loadReports();
    } else {
      setToast(result.message || 'Failed to generate');
      setTimeout(() => setToast(null), 4000);
    }
  }

  function formatDate(dateStr: string) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function formatTime(isoStr: string) {
    return new Date(isoStr).toLocaleTimeString('en-US', {
      timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit',
    });
  }

  function formatShiftDate(isoStr: string) {
    return new Date(isoStr).toLocaleDateString('en-US', {
      timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric',
    });
  }

  function buildWeeklyBreakdown(shifts: Shift[], breaks: BreakLog[], startDate: string, endDate: string) {
    const ppStart = parseLocalDate(startDate);
    const week1End = new Date(ppStart);
    week1End.setDate(ppStart.getDate() + 6);
    const week2Start = new Date(ppStart);
    week2Start.setDate(ppStart.getDate() + 7);
    const ppEnd = parseLocalDate(endDate);

    const weeks = [
      { label: 'Week 1', start: ppStart, end: week1End },
      { label: 'Week 2', start: week2Start, end: ppEnd },
    ];

    return weeks.map(week => {
      const weekShifts = shifts.filter(s => {
        const shiftDate = new Date(new Date(s.clock_in_time).toLocaleString('en-US', { timeZone: 'America/New_York' }));
        shiftDate.setHours(0, 0, 0, 0);
        return shiftDate >= week.start && shiftDate <= week.end;
      });

      const shiftsWithBreaks = weekShifts.map(s => {
        const shiftBreaks = breaks.filter(b => b.clock_log_id === s.id);
        const breakMin = shiftBreaks.reduce((sum, b) => sum + (b.duration_minutes || 0), 0);
        const netMin = Math.max(0, (s.duration_minutes || 0) - breakMin);
        return { ...s, breakMinutes: breakMin, netMinutes: netMin, breaks: shiftBreaks };
      });

      const totalMin = shiftsWithBreaks.reduce((s, sh) => s + (sh.duration_minutes || 0), 0);
      const breakMin = shiftsWithBreaks.reduce((s, sh) => s + sh.breakMinutes, 0);
      const netMin = shiftsWithBreaks.reduce((s, sh) => s + sh.netMinutes, 0);
      const otMin = Math.max(0, netMin - 40 * 60);

      return { ...week, shifts: shiftsWithBreaks, totalMin, breakMin, netMin, otMin };
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-3 border-moja-orange border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // === DETAIL VIEW ===
  if (selectedReport) {
    const { report, shifts, breaks, notes } = selectedReport;
    const openNotes = notes.filter(n => n.status !== 'resolved');
    const resolvedNotes = notes.filter(n => n.status === 'resolved');
    const weeklyData = buildWeeklyBreakdown(shifts, breaks, report.pay_period.start_date, report.pay_period.end_date);

    const liveNetHours = weeklyData.reduce((s, w) => s + w.netMin, 0) / 60;
    const liveBreakHours = weeklyData.reduce((s, w) => s + w.breakMin, 0) / 60;
    const liveOTHours = weeklyData.reduce((s, w) => s + w.otMin, 0) / 60;
    const hasOpenShift = shifts.some(s => !s.clock_out_time);

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedReport(null)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-moja-blue/50 hover:text-moja-blue transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-moja-blue">{report.staff_name}</h2>
            <p className="text-xs text-gray-400">{report.staff_email}</p>
          </div>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${
            report.status === 'approved' ? 'bg-green-100 text-green-700' :
            report.status === 'has_notes' ? 'bg-amber-100 text-amber-700' :
            'bg-blue-100 text-blue-700'
          }`}>
            {report.status === 'approved' ? <><CheckCircle className="w-3.5 h-3.5" /> Approved</> :
             report.status === 'has_notes' ? <><MessageSquare className="w-3.5 h-3.5" /> Has Notes</> :
             <><Clock className="w-3.5 h-3.5" /> Pending</>}
          </span>
        </div>

        {/* Live Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">Period</p>
            <p className="text-sm font-bold text-moja-blue mt-1">
              {formatDate(report.pay_period.start_date)} - {formatDate(report.pay_period.end_date)}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">Shifts</p>
            <p className="text-2xl font-bold text-moja-blue mt-1">{shifts.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">Net Hours</p>
            <p className="text-2xl font-bold text-moja-blue mt-1">{liveNetHours.toFixed(1)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">Breaks</p>
            <p className="text-2xl font-bold text-gray-400 mt-1">{liveBreakHours.toFixed(1)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-[11px] text-orange-500 font-semibold uppercase tracking-wide">Overtime</p>
            <p className={`text-2xl font-bold mt-1 ${liveOTHours > 0 ? 'text-orange-500' : 'text-gray-300'}`}>
              {liveOTHours.toFixed(1)}
            </p>
          </div>
        </div>

        {hasOpenShift && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2 text-sm text-green-700 font-semibold">
            <Radio className="w-4 h-4 animate-pulse" /> Currently clocked in
          </div>
        )}

        {/* Open Notes - Priority view */}
        {openNotes.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-amber-700 uppercase tracking-wide flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Open Notes ({openNotes.length})
            </h3>
            {openNotes.map(note => {
              const relatedShift = shifts.find(s => s.id === note.clock_log_id);
              return (
                <div key={note.id} className="bg-white rounded-xl border-2 border-amber-200 p-4 space-y-3">
                  <div>
                    {relatedShift ? (
                      <p className="text-xs text-gray-400 font-semibold mb-1">
                        Shift: {formatShiftDate(relatedShift.clock_in_time)} &middot;
                        {formatTime(relatedShift.clock_in_time)} - {relatedShift.clock_out_time ? formatTime(relatedShift.clock_out_time) : 'open'} &middot;
                        {relatedShift.duration_minutes ? ` ${(relatedShift.duration_minutes / 60).toFixed(1)}h` : ''}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400 font-semibold mb-1">General note</p>
                    )}
                    <p className="text-sm text-gray-800 font-medium">{note.body}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(note.created_at).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </p>
                  </div>

                  {resolveNoteId === note.id ? (
                    <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                      <input
                        value={resolutionText}
                        onChange={e => setResolutionText(e.target.value)}
                        placeholder="Resolution comment (optional)"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-moja-blue"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleResolve(note.id, 'resolve')}
                          disabled={submitting}
                          className="flex-1 px-3 py-2 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
                        >
                          <CheckCircle className="w-3.5 h-3.5" /> Resolve
                        </button>
                        <button
                          onClick={() => handleResolve(note.id, 'dismiss')}
                          disabled={submitting}
                          className="flex-1 px-3 py-2 bg-gray-500 text-white text-xs font-bold rounded-lg hover:bg-gray-600 disabled:opacity-50 flex items-center justify-center gap-1.5"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Dismiss
                        </button>
                        <button
                          onClick={() => setResolveNoteId(null)}
                          className="px-3 py-2 text-gray-400 text-xs font-bold hover:text-gray-600"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setResolveNoteId(note.id); setResolutionText(''); }}
                      className="text-xs font-bold text-moja-blue hover:text-moja-orange transition-colors"
                    >
                      Respond
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Resolved Notes */}
        {resolvedNotes.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-green-700 uppercase tracking-wide flex items-center gap-2">
              <CheckCircle className="w-4 h-4" /> Resolved ({resolvedNotes.length})
            </h3>
            {resolvedNotes.map(note => (
              <div key={note.id} className="bg-green-50 rounded-xl border border-green-100 p-4">
                <p className="text-sm text-gray-700">{note.body}</p>
                {note.resolution_comment && (
                  <p className="text-xs text-green-700 font-medium mt-1.5">Response: {note.resolution_comment}</p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  Resolved {note.resolved_at ? new Date(note.resolved_at).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Weekly Breakdown */}
        {weeklyData.map((week, idx) => (
          <div key={idx} className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-sm font-bold text-moja-blue/70 uppercase tracking-wide">
                {week.label}
                <span className="ml-2 text-xs font-medium text-gray-400 normal-case">
                  {formatDate(week.start.toISOString().split('T')[0])} - {formatDate(week.end.toISOString().split('T')[0])}
                </span>
              </h3>
              <div className="flex items-center gap-3 text-xs font-semibold">
                <span className="text-moja-blue">{(week.netMin / 60).toFixed(1)}h net</span>
                {week.otMin > 0 && (
                  <span className="text-orange-500">+{(week.otMin / 60).toFixed(1)} OT</span>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-500 text-xs">Date</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-500 text-xs">In</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-500 text-xs">Out</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-gray-500 text-xs">Breaks</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-gray-500 text-xs">Net Hrs</th>
                    <th className="text-center px-4 py-2.5 font-semibold text-gray-500 text-xs">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {week.shifts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-4 text-center text-gray-400 text-xs">No shifts this week</td>
                    </tr>
                  ) : (
                    week.shifts.map(shift => {
                      const shiftNotes = notes.filter(n => n.clock_log_id === shift.id);
                      const isOpen = !shift.clock_out_time;
                      return (
                        <tr key={shift.id} className={`border-b border-gray-50 last:border-0 ${isOpen ? 'bg-green-50/50' : ''}`}>
                          <td className="px-4 py-3 font-medium text-gray-800 text-xs whitespace-nowrap">
                            {formatShiftDate(shift.clock_in_time)}
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{formatTime(shift.clock_in_time)}</td>
                          <td className="px-4 py-3 text-xs">
                            {isOpen ? (
                              <span className="inline-flex items-center gap-1 text-green-600 font-semibold">
                                <Radio className="w-3 h-3 animate-pulse" /> Active
                              </span>
                            ) : (
                              <span className="text-gray-600">{formatTime(shift.clock_out_time!)}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-xs">
                            {shift.breakMinutes > 0 ? (
                              <span className="inline-flex items-center gap-1 text-gray-400">
                                <Coffee className="w-3 h-3" /> {shift.breakMinutes}m
                              </span>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-moja-blue text-xs">
                            {shift.netMinutes ? (shift.netMinutes / 60).toFixed(1) : '-'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {shiftNotes.length > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-xs font-bold text-amber-600">
                                <MessageSquare className="w-3 h-3" /> {shiftNotes.length}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // === LIST VIEW ===
  const displayReports = view === 'pending' ? reports : allReports;

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-moja-blue text-white px-4 py-3 rounded-xl shadow-xl text-sm font-semibold animate-fade-in">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-moja-blue">Timecard Reports</h2>
          {reports.length > 0 && (
            <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2.5 py-1 rounded-full">
              {reports.length} need review
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => loadReports()}
            className="p-2 text-gray-400 hover:text-moja-blue rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex items-center gap-2 px-4 py-2 bg-moja-orange text-white text-sm font-bold rounded-lg hover:bg-moja-orange/90 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {generating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            Generate Reports
          </button>
        </div>
      </div>

      {/* Tab Toggle */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setView('pending')}
          className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${
            view === 'pending' ? 'bg-white text-moja-blue shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Needs Review ({reports.length})
        </button>
        <button
          onClick={() => setView('all')}
          className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${
            view === 'all' ? 'bg-white text-moja-blue shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          All Reports
        </button>
      </div>

      {displayReports.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <CheckCircle className="w-12 h-12 text-green-300 mx-auto mb-3" />
          <p className="text-lg font-bold text-gray-400">
            {view === 'pending' ? 'All caught up!' : 'No reports generated yet'}
          </p>
          <p className="text-sm text-gray-300 mt-1">
            {view === 'pending' ? 'No timecards need your attention right now.' : 'Reports are generated every other Friday at 3 PM EST.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayReports.map(report => {
            const openNoteCount = report.notes?.filter(n => n.status !== 'resolved').length || 0;
            const liveHours = report.live_total_hours ?? report.total_hours;

            return (
              <button
                key={report.id}
                onClick={() => loadDetail(report.id)}
                className="w-full text-left bg-white rounded-xl border border-gray-100 p-4 sm:p-5 hover:border-moja-blue/30 hover:shadow-md transition-all group"
              >
                <div className="flex items-center gap-4">
                  {/* Status Icon */}
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    report.status === 'has_notes' ? 'bg-amber-100' :
                    report.status === 'approved' ? 'bg-green-100' : 'bg-blue-100'
                  }`}>
                    {report.status === 'has_notes' ? <MessageSquare className="w-5 h-5 text-amber-600" /> :
                     report.status === 'approved' ? <CheckCircle className="w-5 h-5 text-green-600" /> :
                     <Clock className="w-5 h-5 text-blue-600" />}
                  </div>

                  {/* Name + Period */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-gray-800 truncate">{report.staff?.name || 'Unknown'}</p>
                      {report.has_open_shift && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-[10px] font-bold flex-shrink-0">
                          <Radio className="w-2.5 h-2.5 animate-pulse" /> LIVE
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 font-medium mt-0.5">
                      {report.pay_periods ? `${formatDate(report.pay_periods.start_date)} - ${formatDate(report.pay_periods.end_date)}` : ''}
                      {report.shift_count !== undefined && (
                        <span className="ml-2 text-gray-300">{report.shift_count} shifts</span>
                      )}
                    </p>
                  </div>

                  {/* Hours Data */}
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold text-moja-blue">{liveHours.toFixed(1)}h</p>
                    <div className="flex items-center gap-2 justify-end">
                      {report.overtime_hours > 0 && (
                        <span className="text-xs text-orange-500 font-semibold">+{report.overtime_hours.toFixed(1)} OT</span>
                      )}
                    </div>
                  </div>

                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-moja-blue transition-colors flex-shrink-0" />
                </div>

                {/* Open notes indicator */}
                {openNoteCount > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-50 flex items-center gap-2 text-xs text-amber-600 font-semibold">
                    <MessageSquare className="w-3.5 h-3.5" />
                    {openNoteCount} open note{openNoteCount > 1 ? 's' : ''} need{openNoteCount === 1 ? 's' : ''} response
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {loadingDetail && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="w-10 h-10 border-3 border-moja-orange border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
