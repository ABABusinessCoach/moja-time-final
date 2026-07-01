import { useState, useEffect, useRef } from 'react';
import { Clock, AlertTriangle, CheckCircle, MessageSquare, Send, Pencil, Trash2, ArrowLeft, Coffee, ThumbsUp, CalendarX, ShieldCheck, Lock } from 'lucide-react';
import { callTimecardFunction } from '../lib/supabase';
import { BrandAccents } from '../components/BrandAccents';

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

interface ReportData {
  report: {
    id: string;
    staff_name: string;
    staff_email: string;
    total_hours: number;
    overtime_hours: number;
    status: 'pending_review' | 'has_notes' | 'approved';
    generated_at: string;
    approved_at: string | null;
    pay_period: {
      start_date: string;
      end_date: string;
      status: string;
    };
  };
  shifts: Shift[];
  breaks: BreakLog[];
  notes: ShiftNote[];
}

interface WeekData {
  label: string;
  startDate: Date;
  endDate: Date;
  shifts: Array<Shift & { netMinutes: number; breakMinutes: number }>;
  totalMinutes: number;
  breakMinutes: number;
  netMinutes: number;
  overtimeMinutes: number;
  missingDays: string[];
}

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function getShiftDateEST(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function TimecardReportPage({ token }: { token: string }) {
  const [verified, setVerified] = useState(false);
  const [staffName, setStaffName] = useState('');
  const [pinDigits, setPinDigits] = useState(['', '', '', '']);
  const [pinError, setPinError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [noteText, setNoteText] = useState('');
  const [noteShiftId, setNoteShiftId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    if (verified) loadReport();
  }, [verified, token]);

  async function handlePinVerify() {
    const pin = pinDigits.join('');
    if (pin.length !== 4) {
      setPinError('Please enter all 4 digits');
      return;
    }
    setVerifying(true);
    setPinError('');
    const result = await callTimecardFunction('/verify-pin', {
      body: { access_token: token, pin },
    });
    setVerifying(false);
    if (result.success) {
      setStaffName(result.staff_name || '');
      setVerified(true);
    } else {
      setPinError(result.message || 'Invalid PIN');
      setPinDigits(['', '', '', '']);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
  }

  function handlePinInput(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    const digit = value.slice(-1);
    const newDigits = [...pinDigits];
    newDigits[index] = digit;
    setPinDigits(newDigits);
    setPinError('');

    if (digit && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }
    if (digit && index === 3) {
      const pin = newDigits.join('');
      if (pin.length === 4) {
        setTimeout(() => handlePinVerify(), 50);
      }
    }
  }

  function handlePinKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !pinDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'Enter') {
      handlePinVerify();
    }
  }

  async function loadReport() {
    setLoading(true);
    const result = await callTimecardFunction(`/by-token/${token}`);
    if (result.success) {
      setData(result);
    } else {
      setError(result.message || 'Failed to load report');
    }
    setLoading(false);
  }

  async function handleAddNote() {
    if (!noteText.trim()) return;
    setSubmitting(true);
    const shiftId = noteShiftId === 'general' ? null : noteShiftId;
    const result = await callTimecardFunction('/notes', {
      body: { access_token: token, clock_log_id: shiftId, body: noteText.trim() },
    });
    if (result.success) {
      setNoteText('');
      setNoteShiftId(null);
      await loadReport();
    }
    setSubmitting(false);
  }

  async function handleUpdateNote(noteId: string) {
    if (!editText.trim()) return;
    setSubmitting(true);
    await callTimecardFunction('/notes', {
      method: 'PUT',
      body: { access_token: token, note_id: noteId, body: editText.trim() },
    });
    setEditingNoteId(null);
    setEditText('');
    await loadReport();
    setSubmitting(false);
  }

  async function handleDeleteNote(noteId: string) {
    if (!confirm('Delete this note?')) return;
    await callTimecardFunction('/notes', {
      method: 'DELETE',
      body: { access_token: token, note_id: noteId },
    });
    await loadReport();
  }

  async function handleApprove() {
    setApproving(true);
    const result = await callTimecardFunction('/approve', {
      body: { access_token: token },
    });
    if (result.success) {
      await loadReport();
    }
    setApproving(false);
  }

  function formatTime(isoStr: string) {
    return new Date(isoStr).toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function formatShiftDay(isoStr: string) {
    return new Date(isoStr).toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }

  function formatDateRange(dateStr: string) {
    const d = parseLocalDate(dateStr);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function buildWeekData(): WeekData[] {
    if (!data) return [];
    const { report, shifts, breaks } = data;
    const ppStart = parseLocalDate(report.pay_period.start_date);

    const week1End = new Date(ppStart);
    week1End.setDate(ppStart.getDate() + 6);

    const week2Start = new Date(ppStart);
    week2Start.setDate(ppStart.getDate() + 7);

    const ppEnd = parseLocalDate(report.pay_period.end_date);

    const weeks: Array<{ label: string; start: Date; end: Date }> = [
      { label: 'Week 1', start: ppStart, end: week1End },
      { label: 'Week 2', start: week2Start, end: ppEnd },
    ];

    return weeks.map(week => {
      const weekShifts = shifts
        .filter(s => {
          const shiftDate = new Date(new Date(s.clock_in_time).toLocaleString('en-US', { timeZone: 'America/New_York' }));
          shiftDate.setHours(0, 0, 0, 0);
          return shiftDate >= week.start && shiftDate <= week.end;
        })
        .map(s => {
          const shiftBreaks = breaks.filter(b => b.clock_log_id === s.id);
          const breakMin = shiftBreaks.reduce((sum, b) => sum + (b.duration_minutes || 0), 0);
          const netMin = Math.max(0, (s.duration_minutes || 0) - breakMin);
          return { ...s, netMinutes: netMin, breakMinutes: breakMin };
        });

      const totalMin = weekShifts.reduce((s, sh) => s + (sh.duration_minutes || 0), 0);
      const breakMin = weekShifts.reduce((s, sh) => s + sh.breakMinutes, 0);
      const netMin = weekShifts.reduce((s, sh) => s + sh.netMinutes, 0);
      const otMin = Math.max(0, netMin - 40 * 60);

      const workedDates = new Set(weekShifts.map(s => getShiftDateEST(s.clock_in_time)));
      const missingDays: string[] = [];
      const cursor = new Date(week.start);
      while (cursor <= week.end) {
        const dow = cursor.getDay();
        if (dow >= 1 && dow <= 5) {
          const cursorStr = cursor.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
          if (!workedDates.has(cursorStr)) {
            missingDays.push(cursor.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
          }
        }
        cursor.setDate(cursor.getDate() + 1);
      }

      return {
        label: week.label,
        startDate: week.start,
        endDate: week.end,
        shifts: weekShifts,
        totalMinutes: totalMin,
        breakMinutes: breakMin,
        netMinutes: netMin,
        overtimeMinutes: otMin,
        missingDays,
      };
    });
  }

  // === PIN VERIFICATION SCREEN ===
  if (!verified) {
    return (
      <div className="min-h-[100dvh] bg-moja-bg relative flex items-center justify-center p-4">
        <BrandAccents />
        <div className="relative z-10 w-full max-w-sm">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
            <div className="bg-moja-blue p-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-3">
                <Lock className="w-7 h-7 text-white" />
              </div>
              <h1 className="text-xl font-bold text-white">Timecard Review</h1>
              <p className="text-white/60 text-sm mt-1">Enter your 4-digit PIN to view your report</p>
            </div>

            <div className="p-6 space-y-6">
              <div className="flex justify-center gap-3">
                {[0, 1, 2, 3].map(i => (
                  <input
                    key={i}
                    ref={el => { inputRefs.current[i] = el; }}
                    type="tel"
                    inputMode="numeric"
                    maxLength={1}
                    value={pinDigits[i]}
                    onChange={e => handlePinInput(i, e.target.value)}
                    onKeyDown={e => handlePinKeyDown(i, e)}
                    className={`w-14 h-16 text-center text-2xl font-bold border-2 rounded-xl outline-none transition-all ${
                      pinError
                        ? 'border-red-300 bg-red-50 text-red-600 animate-shake'
                        : pinDigits[i]
                          ? 'border-moja-blue bg-moja-blue/5 text-moja-blue'
                          : 'border-gray-200 bg-gray-50 text-gray-800 focus:border-moja-blue focus:bg-white'
                    }`}
                    autoFocus={i === 0}
                  />
                ))}
              </div>

              {pinError && (
                <p className="text-center text-sm font-semibold text-red-500">{pinError}</p>
              )}

              <button
                onClick={handlePinVerify}
                disabled={verifying || pinDigits.join('').length !== 4}
                className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-moja-orange text-white font-bold rounded-xl hover:bg-moja-orange/90 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg shadow-orange-200"
              >
                {verifying ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <ShieldCheck className="w-5 h-5" />
                    Verify & View Timecard
                  </>
                )}
              </button>

              <p className="text-center text-xs text-gray-400">
                Use the same PIN you use to clock in/out.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // === LOADING STATE ===
  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-moja-bg flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-moja-orange border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // === ERROR STATE ===
  if (error || !data) {
    return (
      <div className="min-h-[100dvh] bg-moja-bg flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-800 mb-2">Report Not Found</h2>
          <p className="text-sm text-gray-500">{error || 'This report link may have expired or is invalid.'}</p>
          <a href="#/" className="inline-block mt-6 text-sm font-semibold text-moja-blue hover:text-moja-orange transition-colors">
            Back to Time Clock
          </a>
        </div>
      </div>
    );
  }

  // === REPORT VIEW ===
  const { report, notes } = data;
  const isApproved = report.status === 'approved';
  const canAddNotes = !isApproved;
  const weekData = buildWeekData();

  const getNotesForShift = (shiftId: string) => notes.filter(n => n.clock_log_id === shiftId);
  const generalNotes = notes.filter(n => !n.clock_log_id);

  const totalNetHours = weekData.reduce((s, w) => s + w.netMinutes, 0) / 60;
  const totalBreakHours = weekData.reduce((s, w) => s + w.breakMinutes, 0) / 60;
  const totalShifts = weekData.reduce((s, w) => s + w.shifts.length, 0);

  return (
    <div className="min-h-[100dvh] bg-moja-bg relative">
      <BrandAccents />
      <div className="relative z-10 max-w-2xl mx-auto p-4 sm:p-6 pb-32">
        {/* Back Link */}
        <a href="#/" className="inline-flex items-center gap-1.5 text-sm text-moja-blue/50 hover:text-moja-blue font-medium mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Clock
        </a>

        {/* Deadline / Status Banner */}
        {!isApproved && report.status === 'pending_review' && (
          <div className="mb-4 bg-amber-50 border-2 border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-amber-800">Please review by 8:00 PM EST today</p>
              <p className="text-xs text-amber-600 mt-0.5">If everything looks correct, tap "Approve" below. After 8:00 PM, this report will be automatically approved unless you add a note.</p>
            </div>
          </div>
        )}
        {!isApproved && report.status === 'has_notes' && (
          <div className="mb-4 bg-blue-50 border-2 border-blue-200 rounded-xl p-4 flex items-start gap-3">
            <MessageSquare className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-blue-800">Your notes are being reviewed</p>
              <p className="text-xs text-blue-600 mt-0.5">A manager will respond to your notes. This report stays open until all notes are resolved.</p>
            </div>
          </div>
        )}

        {/* Header Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden mb-6">
          <div className="bg-moja-blue p-5 sm:p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <Clock className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-white">Timecard Report</h1>
                <p className="text-white/60 text-sm font-medium">{report.staff_name}</p>
              </div>
              <div className="ml-auto">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${
                  isApproved
                    ? 'bg-green-500/20 text-green-100'
                    : report.status === 'has_notes'
                      ? 'bg-amber-500/20 text-amber-100'
                      : 'bg-white/20 text-white/80'
                }`}>
                  {isApproved ? <><CheckCircle className="w-3.5 h-3.5" /> Approved</> :
                   report.status === 'has_notes' ? <><MessageSquare className="w-3.5 h-3.5" /> Has Notes</> :
                   <><Clock className="w-3.5 h-3.5" /> Pending Review</>}
                </span>
              </div>
            </div>
            <p className="text-white/70 text-sm">
              {formatDateRange(report.pay_period.start_date)} &mdash; {formatDateRange(report.pay_period.end_date)}
            </p>
          </div>

          {/* Summary Stats */}
          <div className="p-5 sm:p-6 grid grid-cols-4 gap-4">
            <div>
              <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">Shifts</p>
              <p className="text-2xl font-bold text-moja-blue">{totalShifts}</p>
            </div>
            <div>
              <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">Net Hours</p>
              <p className="text-2xl font-bold text-moja-blue">{totalNetHours.toFixed(1)}</p>
            </div>
            <div>
              <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">Breaks</p>
              <p className="text-2xl font-bold text-gray-400">{totalBreakHours.toFixed(1)}</p>
            </div>
            <div>
              <p className="text-[11px] text-orange-500 font-semibold uppercase tracking-wide">Overtime</p>
              <p className={`text-2xl font-bold ${report.overtime_hours > 0 ? 'text-orange-500' : 'text-gray-300'}`}>
                {report.overtime_hours.toFixed(1)}
              </p>
            </div>
          </div>
        </div>

        {/* Week-by-week breakdown */}
        {weekData.map((week, weekIdx) => (
          <div key={weekIdx} className="mb-8">
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="text-sm font-bold text-moja-blue/70 uppercase tracking-wide">
                {week.label}
                <span className="ml-2 text-xs font-medium text-gray-400 normal-case">
                  {formatDateRange(week.startDate.toISOString().split('T')[0])} - {formatDateRange(week.endDate.toISOString().split('T')[0])}
                </span>
              </h2>
              <div className="flex items-center gap-3 text-xs font-semibold">
                <span className="text-moja-blue">{(week.netMinutes / 60).toFixed(1)}h</span>
                {week.overtimeMinutes > 0 && (
                  <span className="text-orange-500">+{(week.overtimeMinutes / 60).toFixed(1)} OT</span>
                )}
              </div>
            </div>

            {week.shifts.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-100 p-5 text-center">
                <p className="text-sm text-gray-400">No shifts recorded this week.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {week.shifts.map(shift => {
                  const shiftNotes = getNotesForShift(shift.id);
                  const netHrs = (shift.netMinutes / 60).toFixed(1);
                  const grossHrs = shift.duration_minutes ? (shift.duration_minutes / 60).toFixed(1) : '...';

                  return (
                    <div key={shift.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                      <div className="p-4 sm:p-5">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-bold text-gray-800">
                              {formatShiftDay(shift.clock_in_time)}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {formatTime(shift.clock_in_time)}
                              {shift.clock_out_time ? ` - ${formatTime(shift.clock_out_time)}` : ' - (still clocked in)'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-moja-blue">{netHrs}h</p>
                            {shift.breakMinutes > 0 && (
                              <p className="text-xs text-gray-400 flex items-center justify-end gap-1">
                                <Coffee className="w-3 h-3" />
                                {shift.breakMinutes}m break
                                <span className="text-gray-300">({grossHrs}h gross)</span>
                              </p>
                            )}
                          </div>
                        </div>

                        {shiftNotes.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {shiftNotes.map(note => (
                              <div key={note.id} className={`rounded-lg p-3 text-sm ${
                                note.status === 'resolved'
                                  ? 'bg-green-50 border border-green-100'
                                  : 'bg-amber-50 border border-amber-100'
                              }`}>
                                {editingNoteId === note.id ? (
                                  <div className="flex gap-2">
                                    <input
                                      value={editText}
                                      onChange={e => setEditText(e.target.value)}
                                      className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-moja-blue"
                                      autoFocus
                                      onKeyDown={e => { if (e.key === 'Enter') handleUpdateNote(note.id); if (e.key === 'Escape') setEditingNoteId(null); }}
                                    />
                                    <button
                                      onClick={() => handleUpdateNote(note.id)}
                                      disabled={submitting}
                                      className="px-3 py-1.5 bg-moja-blue text-white text-xs font-bold rounded-lg"
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={() => setEditingNoteId(null)}
                                      className="px-3 py-1.5 text-gray-500 text-xs font-bold"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <p className="text-gray-700">{note.body}</p>
                                    {note.resolution_comment && (
                                      <p className="mt-1.5 text-xs text-green-700 font-medium">
                                        Manager: {note.resolution_comment}
                                      </p>
                                    )}
                                    <div className="flex items-center gap-3 mt-2">
                                      <span className={`text-xs font-semibold ${
                                        note.status === 'resolved' ? 'text-green-600' : 'text-amber-600'
                                      }`}>
                                        {note.status === 'resolved' ? 'Resolved' : 'Open'}
                                      </span>
                                      {note.status === 'open' && note.author_type === 'employee' && canAddNotes && (
                                        <>
                                          <button
                                            onClick={() => { setEditingNoteId(note.id); setEditText(note.body); }}
                                            className="text-xs text-gray-400 hover:text-moja-blue flex items-center gap-1"
                                          >
                                            <Pencil className="w-3 h-3" /> Edit
                                          </button>
                                          <button
                                            onClick={() => handleDeleteNote(note.id)}
                                            className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1"
                                          >
                                            <Trash2 className="w-3 h-3" /> Delete
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {canAddNotes && noteShiftId !== shift.id && (
                          <button
                            onClick={() => { setNoteShiftId(shift.id); setNoteText(''); }}
                            className="mt-3 text-xs font-semibold text-moja-blue/40 hover:text-moja-orange flex items-center gap-1 transition-colors"
                          >
                            <MessageSquare className="w-3.5 h-3.5" /> Something wrong?
                          </button>
                        )}

                        {canAddNotes && noteShiftId === shift.id && (
                          <div className="mt-3 flex gap-2">
                            <input
                              value={noteText}
                              onChange={e => setNoteText(e.target.value)}
                              placeholder="Describe the issue (e.g., forgot to clock out, wrong time)"
                              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-moja-blue"
                              autoFocus
                              onKeyDown={e => { if (e.key === 'Enter') handleAddNote(); if (e.key === 'Escape') setNoteShiftId(null); }}
                            />
                            <button
                              onClick={handleAddNote}
                              disabled={submitting || !noteText.trim()}
                              className="px-3 py-2 bg-moja-orange text-white rounded-lg disabled:opacity-40 transition-opacity"
                            >
                              <Send className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setNoteShiftId(null)}
                              className="px-2 py-2 text-gray-400 hover:text-gray-600 text-lg"
                            >
                              &times;
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {week.missingDays.length > 0 && (
              <div className="mt-3 bg-gray-50 rounded-xl border border-dashed border-gray-200 p-3">
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <CalendarX className="w-3.5 h-3.5" />
                  <span className="font-semibold">No shifts recorded:</span>
                  <span>{week.missingDays.join(', ')}</span>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* General Notes Section */}
        <div className="mb-8 space-y-3">
          <h2 className="text-sm font-bold text-moja-blue/70 uppercase tracking-wide px-1">General Notes</h2>

          {generalNotes.map(note => (
            <div key={note.id} className={`bg-white rounded-xl border p-4 ${
              note.status === 'resolved' ? 'border-green-200' : 'border-amber-200'
            }`}>
              {editingNoteId === note.id ? (
                <div className="flex gap-2">
                  <input
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-moja-blue"
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') handleUpdateNote(note.id); if (e.key === 'Escape') setEditingNoteId(null); }}
                  />
                  <button
                    onClick={() => handleUpdateNote(note.id)}
                    disabled={submitting}
                    className="px-3 py-1.5 bg-moja-blue text-white text-xs font-bold rounded-lg"
                  >
                    Save
                  </button>
                  <button onClick={() => setEditingNoteId(null)} className="px-3 py-1.5 text-gray-500 text-xs font-bold">
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-700">{note.body}</p>
                  {note.resolution_comment && (
                    <p className="mt-1.5 text-xs text-green-700 font-medium">Manager: {note.resolution_comment}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <span className={`text-xs font-semibold ${note.status === 'resolved' ? 'text-green-600' : 'text-amber-600'}`}>
                      {note.status === 'resolved' ? 'Resolved' : 'Open'}
                    </span>
                    {note.status === 'open' && note.author_type === 'employee' && canAddNotes && (
                      <>
                        <button
                          onClick={() => { setEditingNoteId(note.id); setEditText(note.body); }}
                          className="text-xs text-gray-400 hover:text-moja-blue flex items-center gap-1"
                        >
                          <Pencil className="w-3 h-3" /> Edit
                        </button>
                        <button
                          onClick={() => handleDeleteNote(note.id)}
                          className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}

          {canAddNotes && (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs font-semibold text-gray-500 mb-2">Add a general note about this pay period</p>
              <div className="flex gap-2">
                <input
                  value={noteShiftId === 'general' ? noteText : ''}
                  onChange={e => { setNoteShiftId('general'); setNoteText(e.target.value); }}
                  onFocus={() => { if (noteShiftId !== 'general') { setNoteShiftId('general'); setNoteText(''); } }}
                  placeholder="e.g., I worked Tuesday but forgot to clock in"
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-moja-blue"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && noteShiftId === 'general' && noteText.trim()) {
                      handleAddNote();
                    }
                  }}
                />
                <button
                  onClick={() => { if (noteShiftId === 'general') handleAddNote(); }}
                  disabled={submitting || !noteText.trim() || noteShiftId !== 'general'}
                  className="px-4 py-2 bg-moja-orange text-white rounded-lg font-bold text-sm disabled:opacity-40 transition-opacity"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Approve / Approved Section */}
        {isApproved ? (
          <div className="bg-green-50 border-2 border-green-200 rounded-xl p-5 text-center">
            <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
            <p className="font-bold text-green-800">This timecard has been approved</p>
            {report.approved_at && (
              <p className="text-xs text-green-600 mt-1">
                Approved on {new Date(report.approved_at).toLocaleDateString('en-US', {
                  timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit'
                })}
              </p>
            )}
          </div>
        ) : report.status === 'pending_review' ? (
          <div className="bg-white rounded-2xl border-2 border-green-200 p-6 text-center shadow-sm">
            <ThumbsUp className="w-10 h-10 text-green-500 mx-auto mb-3" />
            <p className="font-bold text-gray-800 mb-1">Everything look correct?</p>
            <p className="text-sm text-gray-500 mb-4">If your hours and shifts are accurate, approve your timecard.</p>
            <button
              onClick={handleApprove}
              disabled={approving}
              className="inline-flex items-center gap-2 px-8 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg shadow-green-200"
            >
              {approving ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <CheckCircle className="w-5 h-5" />
              )}
              Approve Timecard
            </button>
            <p className="text-xs text-gray-400 mt-3">
              Or add a note above on any shift that needs correction.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
