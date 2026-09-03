import React, { useState, useEffect, useRef } from 'react';
import { Clock, AlertTriangle, CheckCircle, MessageSquare, Send, Pencil, Trash2, ArrowLeft, ThumbsUp, ShieldCheck, Lock, Save, X, XCircle } from 'lucide-react';
import { callTimecardFunction } from '../lib/supabase';
import { BrandAccents } from '../components/BrandAccents';
import { Toast } from '../components/Toast';
import { formatHM, formatHMFromHours } from '../lib/formatTime';

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

interface Correction {
  id: string;
  clock_log_id: string;
  original_clock_in: string;
  original_clock_out: string;
  proposed_clock_in: string;
  proposed_clock_out: string;
  proposed_duration_minutes: number;
  proposed_hours: number | null;
  approval_status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  note: string | null;
  created_at: string;
}

interface ReportData {
  report: {
    id: string;
    staff_name: string;
    staff_email: string;
    employee_number: string | null;
    total_hours: number;
    overtime_hours: number;
    status: 'pending_review' | 'has_notes' | 'employee_approved' | 'approved';
    generated_at: string;
    approved_at: string | null;
    admin_approved_at: string | null;
    pay_period: {
      start_date: string;
      end_date: string;
      status: string;
    };
  };
  shifts: Shift[];
  breaks: BreakLog[];
  notes: ShiftNote[];
  corrections: Correction[];
}

interface AvailableReport {
  id: string;
  access_token: string;
  status: string;
  start_date: string;
  end_date: string;
}

const DAY_NAMES = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toESTDate(date: Date): Date {
  return new Date(date.toLocaleString('en-US', { timeZone: 'America/New_York' }));
}

function formatTimeEST(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatMinsToHours(mins: number): string {
  if (mins <= 0) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}:${m.toString().padStart(2, '0')}`;
}

function formatDecimalHours(mins: number): string {
  if (mins <= 0) return '';
  return formatHM(mins);
}

function getShiftDateKey(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function formatDateShort(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface ShiftRow {
  shift: Shift;
  breaks: BreakLog[];
  correction: Correction | null;
  pendingCorrection: Correction | null;
  rejectedCorrection: Correction | null;
  notes: ShiftNote[];
  shiftMinutes: number;
}

interface DayRow {
  date: Date;
  dateKey: string;
  dayName: string;
  shift: Shift | null;
  shiftRows: ShiftRow[];
  breaks: BreakLog[];
  correction: Correction | null;
  pendingCorrection: Correction | null;
  rejectedCorrection: Correction | null;
  notes: ShiftNote[];
  netMinutes: number;
  regMinutes: number;
  otMinutes: number;
}

interface WeekBlock {
  label: string;
  dateRange: string;
  days: DayRow[];
  totalMinutes: number;
  regMinutes: number;
  otMinutes: number;
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
  const [approving, setApproving] = useState(false);

  // Period switching
  const [availableReports, setAvailableReports] = useState<AvailableReport[]>([]);
  const [activeToken, setActiveToken] = useState(token);

  // Override modal state
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [editClockIn, setEditClockIn] = useState('');
  const [editClockOut, setEditClockOut] = useState('');
  const [editBreakOut, setEditBreakOut] = useState('');
  const [editBreakIn, setEditBreakIn] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editMode, setEditMode] = useState<'times' | 'hours'>('hours');
  const [editHours, setEditHours] = useState('');
  const [savingCorrection, setSavingCorrection] = useState(false);

  // Add shift modal (empty day)
  const [addShiftDate, setAddShiftDate] = useState<string | null>(null);
  const [addShiftNote, setAddShiftNote] = useState('');
  const [addShiftClockIn, setAddShiftClockIn] = useState('');
  const [addShiftClockOut, setAddShiftClockOut] = useState('');
  const [addShiftBreakOut, setAddShiftBreakOut] = useState('');
  const [addShiftBreakIn, setAddShiftBreakIn] = useState('');
  const [savingAddShift, setSavingAddShift] = useState(false);

  // General notes
  const [noteText, setNoteText] = useState('');
  const [noteShiftId, setNoteShiftId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteText, setEditNoteText] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (verified) loadReport();
  }, [verified, activeToken]);

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
      if (result.available_reports) {
        setAvailableReports(result.available_reports);
      }
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
      if (pin.length === 4) setTimeout(() => handlePinVerify(), 50);
    }
  }

  function handlePinKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !pinDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'Enter') handlePinVerify();
  }

  async function loadReport(showSpinner = true) {
    if (showSpinner) setLoading(true);
    setError('');
    const result = await callTimecardFunction(`/by-token/${activeToken}`);
    if (result.success) {
      setData(result);
    } else {
      setError(result.message || 'Failed to load report');
    }
    setLoading(false);
  }

  async function handleApprove() {
    setApproving(true);
    try {
      const result = await callTimecardFunction('/approve', { body: { access_token: activeToken } });
      if (result.success) {
        setToast({ message: 'Timecard approved successfully!', type: 'success' });
        await loadReport(false);
      } else {
        setToast({ message: result.message || 'Failed to approve timecard. Please try again.', type: 'error' });
      }
    } catch {
      setToast({ message: 'Network error. Please check your connection and try again.', type: 'error' });
    }
    setApproving(false);
  }

  function toESTInputTime(isoStr: string): string {
    const d = new Date(isoStr);
    const est = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    return `${est.getHours().toString().padStart(2, '0')}:${est.getMinutes().toString().padStart(2, '0')}`;
  }

  function toISOFromESTTime(dateStr: string, timeStr: string): string {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const estDate = new Date(dateStr + 'T00:00:00');
    estDate.setHours(hours, minutes, 0, 0);
    const utcDate = new Date(estDate.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const diff = estDate.getTime() - utcDate.getTime();
    return new Date(estDate.getTime() + diff).toISOString();
  }

  function openEditModal(shift: Shift) {
    setEditingShift(shift);
    const existingCorr = data?.corrections.find(c => c.clock_log_id === shift.id && c.approval_status !== 'rejected');
    // Get existing break for this shift
    const shiftBreak = data?.breaks.find(b => b.clock_log_id === shift.id);
    if (existingCorr) {
      setEditClockIn(toESTInputTime(existingCorr.proposed_clock_in));
      setEditClockOut(toESTInputTime(existingCorr.proposed_clock_out));
      setEditBreakOut(existingCorr.proposed_break_start ? toESTInputTime(existingCorr.proposed_break_start) : (shiftBreak ? toESTInputTime(shiftBreak.break_start) : ''));
      setEditBreakIn(existingCorr.proposed_break_end ? toESTInputTime(existingCorr.proposed_break_end) : (shiftBreak?.break_end ? toESTInputTime(shiftBreak.break_end) : ''));
      setEditNote(existingCorr.note || '');
      if (existingCorr.proposed_hours != null) {
        setEditMode('hours');
        setEditHours(String(existingCorr.proposed_hours));
      } else {
        setEditMode('times');
        setEditHours('');
      }
    } else {
      setEditClockIn(toESTInputTime(shift.clock_in_time));
      setEditClockOut(shift.clock_out_time ? toESTInputTime(shift.clock_out_time) : '');
      setEditBreakOut(shiftBreak ? toESTInputTime(shiftBreak.break_start) : '');
      setEditBreakIn(shiftBreak?.break_end ? toESTInputTime(shiftBreak.break_end) : '');
      setEditNote('');
      setEditMode('hours');
      const netMins = Math.max(0, shift.duration_minutes || 0);
      setEditHours(netMins > 0 ? (netMins / 60).toFixed(2) : '');
    }
  }

  async function handleSaveCorrection() {
    if (!editingShift || !editNote.trim()) return;
    if (editMode === 'times' && (!editClockIn || !editClockOut)) return;
    if (editMode === 'hours' && (!editHours || Number(editHours) < 0)) return;

    setSavingCorrection(true);
    const shiftDate = getShiftDateKey(editingShift.clock_in_time);

    const body: Record<string, unknown> = {
      access_token: activeToken,
      clock_log_id: editingShift.id,
      note: editNote.trim(),
    };

    if (editMode === 'hours') {
      body.proposed_hours = Number(editHours);
    } else {
      body.proposed_clock_in = toISOFromESTTime(shiftDate, editClockIn);
      body.proposed_clock_out = toISOFromESTTime(shiftDate, editClockOut);
    }

    if (editBreakOut) body.proposed_break_start = toISOFromESTTime(shiftDate, editBreakOut);
    if (editBreakIn) body.proposed_break_end = toISOFromESTTime(shiftDate, editBreakIn);

    const result = await callTimecardFunction('/corrections', { body });
    if (result.success) {
      setEditingShift(null);
      setToast({ message: 'Edit submitted for manager review', type: 'success' });
      await loadReport(false);
    } else {
      setToast({ message: result.message || 'Failed to save edit. Please try again.', type: 'error' });
    }
    setSavingCorrection(false);
  }

  function openAddShiftModal(dateKey: string) {
    setAddShiftDate(dateKey);
    setAddShiftNote('');
    setAddShiftClockIn('');
    setAddShiftClockOut('');
    setAddShiftBreakOut('');
    setAddShiftBreakIn('');
  }

  async function handleAddShift() {
    if (!addShiftDate || !addShiftNote.trim()) return;
    if (!addShiftClockIn || !addShiftClockOut) return;

    setSavingAddShift(true);

    const body: Record<string, unknown> = {
      access_token: activeToken,
      date: addShiftDate,
      note: addShiftNote.trim(),
      proposed_clock_in: toISOFromESTTime(addShiftDate, addShiftClockIn),
      proposed_clock_out: toISOFromESTTime(addShiftDate, addShiftClockOut),
    };

    if (addShiftBreakOut && addShiftBreakIn) {
      body.break_start = toISOFromESTTime(addShiftDate, addShiftBreakOut);
      body.break_end = toISOFromESTTime(addShiftDate, addShiftBreakIn);
    }

    const result = await callTimecardFunction('/add-shift', { body });
    if (result.success) {
      setAddShiftDate(null);
      setToast({ message: 'Shift added for manager review', type: 'success' });
      await loadReport(false);
    } else {
      setToast({ message: result.message || 'Failed to add shift. Please try again.', type: 'error' });
    }
    setSavingAddShift(false);
  }

  async function handleAddNote() {
    if (!noteText.trim()) return;
    setSubmitting(true);
    const shiftId = noteShiftId === 'general' ? null : noteShiftId;
    await callTimecardFunction('/notes', {
      body: { access_token: activeToken, clock_log_id: shiftId, body: noteText.trim() },
    });
    setNoteText('');
    setNoteShiftId(null);
    await loadReport(false);
    setSubmitting(false);
  }

  async function handleUpdateNote(noteId: string) {
    if (!editNoteText.trim()) return;
    setSubmitting(true);
    await callTimecardFunction('/notes', {
      method: 'PUT',
      body: { access_token: activeToken, note_id: noteId, body: editNoteText.trim() },
    });
    setEditingNoteId(null);
    setEditNoteText('');
    await loadReport(false);
    setSubmitting(false);
  }

  async function handleDeleteNote(noteId: string) {
    if (!confirm('Delete this note?')) return;
    await callTimecardFunction('/notes', {
      method: 'DELETE',
      body: { access_token: activeToken, note_id: noteId },
    });
    await loadReport(false);
  }

  function buildWeekBlocks(): WeekBlock[] {
    if (!data) return [];
    const { report, shifts, breaks, corrections, notes } = data;
    const ppStart = parseLocalDate(report.pay_period.start_date);
    const OT_THRESHOLD = 40 * 60;

    const weeks: WeekBlock[] = [];
    for (let w = 0; w < 2; w++) {
      const weekStart = new Date(ppStart);
      weekStart.setDate(ppStart.getDate() + w * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      const days: DayRow[] = [];
      let weekNetTotal = 0;

      for (let d = 0; d < 7; d++) {
        const currentDate = new Date(weekStart);
        currentDate.setDate(weekStart.getDate() + d);
        const dateKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;

        const dayShifts = shifts.filter(s => getShiftDateKey(s.clock_in_time) === dateKey);
        const shift = dayShifts.length > 0 ? dayShifts[0] : null;

        const dayBreaks = shift ? breaks.filter(b => dayShifts.some(s => s.id === b.clock_log_id)) : [];

        const correction = shift ? (corrections.find(c => c.clock_log_id === shift.id && c.approval_status === 'approved') || null) : null;
        const pendingCorrection = shift ? (corrections.find(c => c.clock_log_id === shift.id && c.approval_status === 'pending') || null) : null;
        const rejectedCorrection = shift ? (corrections.find(c => c.clock_log_id === shift.id && c.approval_status === 'rejected') || null) : null;
        const shiftNotes = shift ? notes.filter(n => dayShifts.some(s => s.id === n.clock_log_id)) : [];

        let netMinutes = 0;
        const shiftRows: ShiftRow[] = [];
        for (const s of dayShifts) {
          const sBreaks = breaks.filter(b => b.clock_log_id === s.id);
          const sCorrection = corrections.find(c => c.clock_log_id === s.id && c.approval_status === 'approved') || null;
          const sPending = corrections.find(c => c.clock_log_id === s.id && c.approval_status === 'pending') || null;
          const sRejected = corrections.find(c => c.clock_log_id === s.id && c.approval_status === 'rejected') || null;
          const sNotes = notes.filter(n => n.clock_log_id === s.id);
          let shiftMins = sCorrection
            ? Math.max(0, sCorrection.proposed_duration_minutes || 0)
            : Math.max(0, s.duration_minutes || 0);
          // Deduct lunch (unpaid); breaks are paid and not deducted
          const lunchMins = sBreaks
            .filter(b => b.break_type === 'lunch' && b.duration_minutes)
            .reduce((sum, b) => sum + (b.duration_minutes || 0), 0);
          shiftMins = Math.max(0, shiftMins - lunchMins);
          netMinutes += shiftMins;
          shiftRows.push({ shift: s, breaks: sBreaks, correction: sCorrection, pendingCorrection: sPending, rejectedCorrection: sRejected, notes: sNotes, shiftMinutes: shiftMins });
        }

        weekNetTotal += netMinutes;
        days.push({
          date: currentDate,
          dateKey,
          dayName: DAY_NAMES[d],
          shift,
          shiftRows,
          breaks: dayBreaks,
          correction,
          pendingCorrection,
          rejectedCorrection,
          notes: shiftNotes,
          netMinutes,
          regMinutes: 0,
          otMinutes: 0,
        });
      }

      const otMinutes = Math.max(0, weekNetTotal - OT_THRESHOLD);
      const regMinutes = weekNetTotal - otMinutes;

      // Distribute OT across shifts (last shifts get OT first)
      let remainingReg = regMinutes;
      for (const day of days) {
        if (day.netMinutes > 0) {
          if (remainingReg >= day.netMinutes) {
            day.regMinutes = day.netMinutes;
            day.otMinutes = 0;
            remainingReg -= day.netMinutes;
          } else {
            day.regMinutes = remainingReg;
            day.otMinutes = day.netMinutes - remainingReg;
            remainingReg = 0;
          }
        }
      }

      weeks.push({
        label: `Week ${w + 1}`,
        dateRange: `${formatDateShort(dateKey(weekStart))} - ${formatDateShort(dateKey(weekEnd))}`,
        days,
        totalMinutes: weekNetTotal,
        regMinutes,
        otMinutes,
      });
    }

    return weeks;

    function dateKey(d: Date): string {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
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
              {pinError && <p className="text-center text-sm font-semibold text-red-500">{pinError}</p>}
              <button
                onClick={handlePinVerify}
                disabled={verifying || pinDigits.join('').length !== 4}
                className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-moja-orange text-white font-bold rounded-xl hover:bg-moja-orange/90 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg shadow-orange-200"
              >
                {verifying ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <><ShieldCheck className="w-5 h-5" /> Verify & View Timecard</>
                )}
              </button>
              <p className="text-center text-xs text-gray-400">Use the same PIN you use to clock in/out.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-moja-bg flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-moja-orange border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-[100dvh] bg-moja-bg flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-800 mb-2">Report Not Found</h2>
          <p className="text-sm text-gray-500">{error || 'This report link may have expired or is invalid.'}</p>
        </div>
      </div>
    );
  }

  const { report, notes } = data;
  const isFullyApproved = report.status === 'approved';
  const isEmployeeApproved = report.status === 'employee_approved';
  const isApproved = isFullyApproved || isEmployeeApproved;
  const estToday = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const inCurrentPayPeriod = estToday <= report.pay_period.end_date;
  const canEdit = !isFullyApproved && inCurrentPayPeriod;
  const weekBlocks = buildWeekBlocks();
  const generalNotes = notes.filter(n => !n.clock_log_id);
  const periodTotal = weekBlocks.reduce((s, w) => s + w.totalMinutes, 0);
  const periodReg = weekBlocks.reduce((s, w) => s + w.regMinutes, 0);
  const periodOT = weekBlocks.reduce((s, w) => s + w.otMinutes, 0);

  return (
    <div className="min-h-[100dvh] bg-moja-bg relative">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <BrandAccents />
      <div className="relative z-10 max-w-4xl mx-auto p-4 sm:p-6 pb-32">
        <a href="#/" className="inline-flex items-center gap-1.5 text-sm text-moja-blue/50 hover:text-moja-blue font-medium mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Clock
        </a>

        {/* Pay Period Switcher */}
        {availableReports.length > 1 && (
          <div className="mb-4">
            <select
              value={activeToken}
              onChange={(e) => { setActiveToken(e.target.value); setData(null); }}
              className="w-full sm:w-auto h-11 px-4 pr-10 text-sm font-bold text-moja-blue bg-white border-2 border-moja-blue/20 rounded-xl focus:border-moja-orange focus:outline-none appearance-none cursor-pointer"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%231B3A5C' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
            >
              {availableReports.map((ar, i) => {
                const label = i === 0 ? 'Current Period' : 'Previous Period';
                const dates = ar.start_date && ar.end_date
                  ? ` (${formatDateShort(ar.start_date)} - ${formatDateShort(ar.end_date)})`
                  : '';
                return (
                  <option key={ar.id} value={ar.access_token}>
                    {label}{dates}
                  </option>
                );
              }).slice(0, 2)}
            </select>
          </div>
        )}

        {/* Status Banners */}
        {!isApproved && report.status === 'pending_review' && (
          <div className="mb-4 bg-amber-50 border-2 border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-amber-800">Please review by 8:00 PM EST today</p>
              <p className="text-xs text-amber-600 mt-0.5">If everything looks correct, tap "Approve" below. Click any time to propose an edit.</p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden mb-6">
          <div className="bg-moja-blue p-5 sm:p-6 flex items-center justify-between">
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-white">Timecard Report</h1>
              <p className="text-white/60 text-sm font-medium mt-0.5">
                {report.employee_number && <span className="font-mono mr-1">#{report.employee_number}</span>}
                {report.staff_name} &middot; {formatDateShort(report.pay_period.start_date)} - {formatDateShort(report.pay_period.end_date)}
              </p>
            </div>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${
              isFullyApproved ? 'bg-green-500/20 text-green-100' :
              isEmployeeApproved ? 'bg-emerald-500/20 text-emerald-100' :
              report.status === 'has_notes' ? 'bg-amber-500/20 text-amber-100' :
              'bg-white/20 text-white/80'
            }`}>
              {isFullyApproved ? <><CheckCircle className="w-3.5 h-3.5" /> Approved</> :
               isEmployeeApproved ? <><CheckCircle className="w-3.5 h-3.5" /> Awaiting Manager</> :
               report.status === 'has_notes' ? <><MessageSquare className="w-3.5 h-3.5" /> Has Notes</> :
               <><Clock className="w-3.5 h-3.5" /> Pending Review</>}
            </span>
          </div>
        </div>

        {/* Timecard Table */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm min-w-[700px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-3 py-2.5 font-bold text-gray-600 w-14">Day</th>
                  <th className="text-left px-2 py-2.5 font-bold text-gray-600">Start</th>
                  <th className="text-left px-2 py-2.5 font-bold text-green-700 text-[11px]">Break Out</th>
                  <th className="text-left px-2 py-2.5 font-bold text-green-700 text-[11px]">Break In</th>
                  <th className="text-center px-2 py-2.5 font-bold text-green-700 text-[11px]">Lunch</th>
                  <th className="text-left px-2 py-2.5 font-bold text-gray-600">End</th>
                  <th className="text-center px-2 py-2.5 font-bold text-gray-600">Vac/Sick</th>
                  <th className="text-right px-2 py-2.5 font-bold text-gray-600">Reg</th>
                  <th className="text-right px-2 py-2.5 font-bold text-orange-600">OT</th>
                  <th className="text-right px-3 py-2.5 font-bold text-moja-blue bg-blue-50">Total</th>
                </tr>
              </thead>
              <tbody>
                {weekBlocks.map((week, wi) => (
                  <WeekSection
                    key={wi}
                    week={week}
                    weekIndex={wi}
                    canEdit={canEdit}
                    onEditShift={openEditModal}
                    onAddShift={openAddShiftModal}
                  />
                ))}
                {/* Period Total */}
                <tr className="bg-gray-100 border-t-2 border-gray-300 font-bold">
                  <td colSpan={7} className="px-3 py-2.5 text-gray-700">Period Total</td>
                  <td className="px-2 py-2.5 text-right text-gray-700">{formatDecimalHours(periodReg)}</td>
                  <td className="px-2 py-2.5 text-right text-orange-600">{formatDecimalHours(periodOT)}</td>
                  <td className="px-3 py-2.5 text-right text-moja-blue bg-blue-50">{formatDecimalHours(periodTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* General Notes Section */}
        <div className="mb-8 space-y-3">
          <h3 className="text-sm font-bold text-moja-blue/70 uppercase tracking-wide px-1">Notes</h3>
          {generalNotes.map(note => (
            <div key={note.id} className={`bg-white rounded-xl border p-4 ${
              note.status === 'resolved' ? 'border-green-200' : 'border-amber-200'
            }`}>
              {editingNoteId === note.id ? (
                <div className="flex gap-2">
                  <input
                    value={editNoteText}
                    onChange={e => setEditNoteText(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-moja-blue"
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') handleUpdateNote(note.id); if (e.key === 'Escape') setEditingNoteId(null); }}
                  />
                  <button onClick={() => handleUpdateNote(note.id)} disabled={submitting} className="px-3 py-1.5 bg-moja-blue text-white text-xs font-bold rounded-lg">Save</button>
                  <button onClick={() => setEditingNoteId(null)} className="px-3 py-1.5 text-gray-500 text-xs font-bold">Cancel</button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-700">{note.body}</p>
                  {note.resolution_comment && <p className="mt-1.5 text-xs text-green-700 font-medium">Manager: {note.resolution_comment}</p>}
                  <div className="flex items-center gap-3 mt-2">
                    <span className={`text-xs font-semibold ${note.status === 'resolved' ? 'text-green-600' : 'text-amber-600'}`}>
                      {note.status === 'resolved' ? 'Resolved' : 'Open'}
                    </span>
                    {note.status === 'open' && note.author_type === 'employee' && canEdit && (
                      <>
                        <button onClick={() => { setEditingNoteId(note.id); setEditNoteText(note.body); }} className="text-xs text-gray-400 hover:text-moja-blue flex items-center gap-1">
                          <Pencil className="w-3 h-3" /> Edit
                        </button>
                        <button onClick={() => handleDeleteNote(note.id)} className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1">
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
          {canEdit && (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs font-semibold text-gray-500 mb-2">Add a general note about this pay period</p>
              <div className="flex gap-2">
                <input
                  value={noteShiftId === 'general' ? noteText : ''}
                  onChange={e => { setNoteShiftId('general'); setNoteText(e.target.value); }}
                  onFocus={() => { if (noteShiftId !== 'general') { setNoteShiftId('general'); setNoteText(''); } }}
                  placeholder="e.g., I worked Tuesday but forgot to clock in"
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-moja-blue"
                  onKeyDown={e => { if (e.key === 'Enter' && noteShiftId === 'general' && noteText.trim()) handleAddNote(); }}
                />
                <button
                  onClick={() => { if (noteShiftId === 'general') handleAddNote(); }}
                  disabled={submitting || !noteText.trim() || noteShiftId !== 'general'}
                  className="px-4 py-2 bg-moja-orange text-white rounded-lg font-bold text-sm disabled:opacity-40"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Approve / Status Section */}
        {isFullyApproved ? (
          <div className="bg-green-50 border-2 border-green-200 rounded-xl p-5 text-center">
            <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
            <p className="font-bold text-green-800">This timecard has been fully approved</p>
            <p className="text-sm text-green-700 mt-1">Your final hours: <span className="font-bold">{formatHMFromHours(report.total_hours)}</span></p>
            {report.admin_approved_at && (
              <p className="text-xs text-green-600 mt-1">
                Manager approved on {new Date(report.admin_approved_at).toLocaleDateString('en-US', {
                  timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit'
                })}
              </p>
            )}
          </div>
        ) : isEmployeeApproved ? (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-5 text-center">
            <Clock className="w-8 h-8 text-blue-500 mx-auto mb-2" />
            <p className="font-bold text-blue-800">You've approved this timecard</p>
            <p className="text-sm text-blue-600 mt-1">Waiting for your manager to review and confirm your final hours.</p>
          </div>
        ) : (report.status === 'pending_review' || report.status === 'has_notes') ? (
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
            <p className="text-xs text-gray-400 mt-3">Or click on any time entry above to propose an edit.</p>
          </div>
        ) : null}
      </div>

      {/* Edit Modal */}
      {editingShift && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setEditingShift(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-moja-blue p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-white font-bold text-lg">Propose Edit</h3>
                  <p className="text-white/60 text-sm">
                    {new Date(editingShift.clock_in_time).toLocaleDateString('en-US', {
                      timeZone: 'America/New_York', weekday: 'long', month: 'short', day: 'numeric'
                    })}
                  </p>
                </div>
                <button onClick={() => setEditingShift(null)} className="p-2 text-white/50 hover:text-white rounded-lg transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Original Times</p>
                <p className="text-sm font-medium text-gray-700">
                  {formatTimeEST(editingShift.clock_in_time)} - {editingShift.clock_out_time ? formatTimeEST(editingShift.clock_out_time) : 'open'}
                  {editingShift.duration_minutes && (
                    <span className="text-gray-400 ml-2">({formatHM(editingShift.duration_minutes)})</span>
                  )}
                </p>
              </div>

              {/* Mode Toggle */}
              <div className="flex rounded-lg border-2 border-gray-200 overflow-hidden">
                <button
                  onClick={() => setEditMode('hours')}
                  className={`flex-1 py-2 text-xs font-bold transition-colors ${editMode === 'hours' ? 'bg-moja-blue text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                >
                  Override Hours
                </button>
                <button
                  onClick={() => setEditMode('times')}
                  className={`flex-1 py-2 text-xs font-bold transition-colors ${editMode === 'times' ? 'bg-moja-blue text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                >
                  Edit Times
                </button>
              </div>

              {editMode === 'hours' ? (
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Total hours worked this day</label>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    max="24"
                    value={editHours}
                    onChange={e => setEditHours(e.target.value)}
                    placeholder="e.g., 8.5"
                    className="w-full px-3 py-2.5 text-sm border-2 border-gray-200 rounded-lg focus:outline-none focus:border-moja-blue"
                  />
                  {editHours && Number(editHours) >= 0 && (() => {
                    const oldNetMins = Math.max(0, editingShift.duration_minutes || 0);
                    const newMins = Number(editHours) * 60;
                    const diff = newMins - oldNetMins;
                    return (
                      <div className="bg-blue-50 rounded-lg p-3 space-y-1.5 mt-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-blue-600 font-medium">Proposed hours:</span>
                          <span className="text-sm font-bold text-blue-700">{formatHM(Number(editHours) * 60)}</span>
                        </div>
                        {diff !== 0 && (
                          <div className="flex items-center justify-between border-t border-blue-100 pt-1.5">
                            <span className="text-xs text-blue-600 font-medium">Difference:</span>
                            <span className={`text-sm font-bold ${diff > 0 ? 'text-green-600' : 'text-red-500'}`}>
                              {diff > 0 ? '+' : ''}{formatHM(Math.abs(diff))}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">New Clock In</label>
                      <input
                        type="time"
                        value={editClockIn}
                        onChange={e => setEditClockIn(e.target.value)}
                        className="w-full px-3 py-2.5 text-sm border-2 border-gray-200 rounded-lg focus:outline-none focus:border-moja-blue"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">New Clock Out</label>
                      <input
                        type="time"
                        value={editClockOut}
                        onChange={e => setEditClockOut(e.target.value)}
                        className="w-full px-3 py-2.5 text-sm border-2 border-gray-200 rounded-lg focus:outline-none focus:border-moja-blue"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-green-700 uppercase tracking-wide mb-1 block">Lunch Out</label>
                      <input
                        type="time"
                        value={editBreakOut}
                        onChange={e => setEditBreakOut(e.target.value)}
                        className="w-full px-3 py-2.5 text-sm border-2 border-gray-200 rounded-lg focus:outline-none focus:border-green-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-green-700 uppercase tracking-wide mb-1 block">Lunch In</label>
                      <input
                        type="time"
                        value={editBreakIn}
                        onChange={e => setEditBreakIn(e.target.value)}
                        className="w-full px-3 py-2.5 text-sm border-2 border-gray-200 rounded-lg focus:outline-none focus:border-green-500"
                      />
                    </div>
                  </div>
                  {editClockIn && editClockOut && (() => {
                    const [hIn, mIn] = editClockIn.split(':').map(Number);
                    const [hOut, mOut] = editClockOut.split(':').map(Number);
                    const grossMins = Math.max(0, (hOut * 60 + mOut) - (hIn * 60 + mIn));
                    let breakMins = 0;
                    if (editBreakOut && editBreakIn) {
                      const [bOutH, bOutM] = editBreakOut.split(':').map(Number);
                      const [bInH, bInM] = editBreakIn.split(':').map(Number);
                      breakMins = Math.max(0, (bInH * 60 + bInM) - (bOutH * 60 + bOutM));
                    }
                    const netMins = Math.max(0, grossMins - breakMins);
                    return (
                      <div className="bg-blue-50 rounded-lg p-3 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-blue-600 font-medium">Net shift hours:</span>
                          <span className="text-sm font-bold text-blue-700">{formatHM(netMins)}</span>
                        </div>
                        {breakMins > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-green-600 font-medium">Lunch deducted:</span>
                            <span className="text-sm font-bold text-green-700">-{formatHM(breakMins)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </>
              )}

              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Reason for edit (required)</label>
                <textarea
                  value={editNote}
                  onChange={e => setEditNote(e.target.value)}
                  placeholder="e.g., Forgot to clock out, actually left at 5:00 PM"
                  rows={2}
                  className="w-full px-3 py-2.5 text-sm border-2 border-gray-200 rounded-lg focus:outline-none focus:border-moja-blue resize-none"
                />
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs text-amber-700 font-medium">This edit will be sent to your manager for approval before it takes effect.</p>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSaveCorrection}
                  disabled={savingCorrection || !editNote.trim() || (editMode === 'times' ? (!editClockIn || !editClockOut) : (!editHours || Number(editHours) < 0))}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-moja-blue text-white font-bold rounded-xl hover:bg-moja-blue/90 disabled:opacity-40 transition-all"
                >
                  {savingCorrection ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <><Save className="w-4 h-4" /> Submit for Approval</>
                  )}
                </button>
                <button
                  onClick={() => setEditingShift(null)}
                  className="px-4 py-3 text-gray-500 font-bold rounded-xl hover:bg-gray-100 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Shift Modal (empty day) */}
      {addShiftDate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setAddShiftDate(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-moja-blue p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-white font-bold text-lg">Add Hours</h3>
                  <p className="text-white/60 text-sm">
                    {parseLocalDate(addShiftDate).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                  </p>
                </div>
                <button onClick={() => setAddShiftDate(null)} className="p-2 text-white/50 hover:text-white rounded-lg transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Clock In</label>
                  <input
                    type="time"
                    value={addShiftClockIn}
                    onChange={e => setAddShiftClockIn(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border-2 border-gray-200 rounded-lg focus:outline-none focus:border-moja-blue"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Clock Out</label>
                  <input
                    type="time"
                    value={addShiftClockOut}
                    onChange={e => setAddShiftClockOut(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border-2 border-gray-200 rounded-lg focus:outline-none focus:border-moja-blue"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-green-700 uppercase tracking-wide mb-1 block">Break Out</label>
                  <input
                    type="time"
                    value={addShiftBreakOut}
                    onChange={e => setAddShiftBreakOut(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border-2 border-gray-200 rounded-lg focus:outline-none focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-green-700 uppercase tracking-wide mb-1 block">Break In</label>
                  <input
                    type="time"
                    value={addShiftBreakIn}
                    onChange={e => setAddShiftBreakIn(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border-2 border-gray-200 rounded-lg focus:outline-none focus:border-green-500"
                  />
                </div>
              </div>
              {addShiftClockIn && addShiftClockOut && (() => {
                const [hIn, mIn] = addShiftClockIn.split(':').map(Number);
                const [hOut, mOut] = addShiftClockOut.split(':').map(Number);
                const netMins = Math.max(0, (hOut * 60 + mOut) - (hIn * 60 + mIn));
                const newPeriodTotal = periodTotal + netMins;
                return (
                  <div className="bg-blue-50 rounded-lg p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-blue-600 font-medium">Net shift hours:</span>
                      <span className="text-sm font-bold text-blue-700">{formatHM(netMins)}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-blue-100 pt-1.5">
                      <span className="text-xs text-blue-600 font-medium">New period total:</span>
                      <span className="text-sm font-bold text-blue-800">
                        {formatHM(newPeriodTotal)}
                        <span className="ml-1.5 text-[11px] text-green-600">(+{formatHM(netMins)})</span>
                      </span>
                    </div>
                  </div>
                );
              })()}
              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Reason (required)</label>
                <textarea
                  value={addShiftNote}
                  onChange={e => setAddShiftNote(e.target.value)}
                  placeholder="e.g., Worked but forgot to clock in"
                  rows={2}
                  className="w-full px-3 py-2.5 text-sm border-2 border-gray-200 rounded-lg focus:outline-none focus:border-moja-blue resize-none"
                />
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs text-amber-700 font-medium">This entry will be sent to your manager for approval.</p>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleAddShift}
                  disabled={savingAddShift || !addShiftNote.trim() || !addShiftClockIn || !addShiftClockOut}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-moja-blue text-white font-bold rounded-xl hover:bg-moja-blue/90 disabled:opacity-40 transition-all"
                >
                  {savingAddShift ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <><Save className="w-4 h-4" /> Submit for Approval</>
                  )}
                </button>
                <button
                  onClick={() => setAddShiftDate(null)}
                  className="px-4 py-3 text-gray-500 font-bold rounded-xl hover:bg-gray-100 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WeekSection({ week, canEdit, onEditShift, onAddShift }: {
  week: WeekBlock;
  weekIndex: number;
  canEdit: boolean;
  onEditShift: (shift: Shift) => void;
  onAddShift: (dateKey: string) => void;
  corrections: Correction[];
}) {
  return (
    <>
      <tr className="bg-gray-100/70 border-t border-gray-200">
        <td colSpan={10} className="px-3 py-2 font-bold text-gray-600 text-xs">
          {week.label} &middot; <span className="font-medium text-gray-400">{week.dateRange}</span>
        </td>
      </tr>
      {week.days.map((day, di) => {
        const isWeekend = di < 2;
        const rowCount = day.shiftRows.length || 1;
        return (
          <React.Fragment key={day.dateKey}>
            {rowCount <= 1 ? (() => {
              const sr = day.shiftRows[0] || null;
              const hasCorrection = !!sr?.correction;
              const hasPending = !!sr?.pendingCorrection;
              const hasRejected = !!sr?.rejectedCorrection;
              const hasNotes = (sr?.notes.length || 0) > 0 || !!sr?.correction?.note || hasPending || hasRejected;
              return (
                <>
                  <tr
                    className={`border-b ${hasNotes ? 'border-b-0' : 'border-gray-100'} last:border-0 transition-colors ${
                      hasPending ? 'bg-amber-50/50' :
                      hasCorrection ? 'bg-blue-50/50' :
                      isWeekend ? 'bg-gray-50/30' : 'hover:bg-gray-50/50'
                    } ${canEdit ? 'cursor-pointer' : ''}`}
                    onClick={() => { if (canEdit && sr) onEditShift(sr.shift); else if (canEdit && !sr) onAddShift(day.dateKey); }}
                  >
                    <td className="px-3 py-2.5 font-bold text-gray-700">
                        {day.dayName} <span className="font-normal text-gray-400 text-xs">{day.date.getMonth() + 1}/{day.date.getDate()}</span>
                      </td>
                    <td className="px-2 py-2.5 text-gray-600 whitespace-nowrap">
                      {sr ? (
                        <CellValue
                          original={formatTimeEST(sr.shift.clock_in_time)}
                          proposed={hasCorrection ? formatTimeEST(sr.correction!.proposed_clock_in) : undefined}
                          changed={hasCorrection && sr.correction!.proposed_clock_in !== sr.correction!.original_clock_in}
                        />
                      ) : ''}
                    </td>
                    <td className="px-2 py-2.5 text-gray-500 whitespace-nowrap text-[11px]">
                      {sr && sr.breaks.length > 0 ? formatTimeEST(sr.breaks[0].break_start) : ''}
                    </td>
                    <td className="px-2 py-2.5 text-gray-500 whitespace-nowrap text-[11px]">
                      {sr && sr.breaks.length > 0 && sr.breaks[0].break_end ? formatTimeEST(sr.breaks[0].break_end) : ''}
                    </td>
                    <td className="px-2 py-2.5 text-center text-green-700 font-medium text-[11px]">
                      {sr && sr.breaks.length > 0 && sr.breaks[0].break_end ? (() => {
                        const start = new Date(sr.breaks[0].break_start).getTime();
                        const end = new Date(sr.breaks[0].break_end!).getTime();
                        const mins = Math.round((end - start) / 60000);
                        return mins > 0 ? formatHM(mins) : '';
                      })() : ''}
                    </td>
                    <td className="px-2 py-2.5 text-gray-600 whitespace-nowrap">
                      {sr?.shift.clock_out_time ? (
                        <CellValue
                          original={formatTimeEST(sr.shift.clock_out_time)}
                          proposed={hasCorrection ? formatTimeEST(sr.correction!.proposed_clock_out) : undefined}
                          changed={hasCorrection && sr.correction!.proposed_clock_out !== sr.correction!.original_clock_out}
                        />
                      ) : sr ? (
                        <span className="text-green-600 text-[10px] font-bold">ACTIVE</span>
                      ) : ''}
                    </td>
                    <td className="px-2 py-2.5 text-center text-gray-400">-</td>
                    <td className="px-2 py-2.5 text-right font-medium text-gray-700">
                      {day.regMinutes > 0 ? formatDecimalHours(day.regMinutes) : ''}
                    </td>
                    <td className="px-2 py-2.5 text-right font-medium text-orange-600">
                      {day.otMinutes > 0 ? formatDecimalHours(day.otMinutes) : ''}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-bold bg-blue-50/50 ${hasCorrection ? 'text-blue-700' : 'text-moja-blue'}`}>
                      {day.netMinutes > 0 ? formatDecimalHours(day.netMinutes) : ''}
                      {hasCorrection && <span className="ml-1 text-[9px] text-blue-500 align-super">*</span>}
                    </td>
                  </tr>
                  {hasNotes && (
                    <tr className={`border-b border-gray-100 ${hasPending ? 'bg-amber-50/30' : hasCorrection ? 'bg-blue-50/30' : ''}`}>
                      <td colSpan={10} className="px-3 pb-2 pt-0">
                        <div className="flex flex-wrap gap-1.5 pl-1">
                          {sr?.pendingCorrection && (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                              <Clock className="w-2.5 h-2.5" />
                              Pending: {sr.pendingCorrection.proposed_hours != null
                                ? `${sr.pendingCorrection.proposed_hours}h`
                                : `${formatTimeEST(sr.pendingCorrection.proposed_clock_in)} - ${formatTimeEST(sr.pendingCorrection.proposed_clock_out)}`
                              }
                              {sr.pendingCorrection.note && ` - ${sr.pendingCorrection.note}`}
                            </span>
                          )}
                          {sr?.rejectedCorrection && (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                              <XCircle className="w-2.5 h-2.5" /> Rejected{sr.rejectedCorrection.rejection_reason ? `: ${sr.rejectedCorrection.rejection_reason}` : ''}
                            </span>
                          )}
                          {sr?.correction?.note && (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                              <Pencil className="w-2.5 h-2.5" /> {sr.correction.note}
                            </span>
                          )}
                          {(sr?.notes || []).map(note => (
                            <span key={note.id} className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${
                              note.status === 'resolved' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              <MessageSquare className="w-2.5 h-2.5" /> {note.body}
                              {note.resolution_comment && <span className="text-green-600 ml-1">- {note.resolution_comment}</span>}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })() : day.shiftRows.map((sr, si) => {
              const hasCorrection = !!sr.correction;
              const hasPending = !!sr.pendingCorrection;
              const hasRejected = !!sr.rejectedCorrection;
              const hasNotes = sr.notes.length > 0 || !!sr.correction?.note || hasPending || hasRejected;
              const isFirst = si === 0;
              const isLast = si === day.shiftRows.length - 1;
              return (
                <React.Fragment key={sr.shift.id}>
                  <tr
                    className={`${isLast ? 'border-b border-gray-100' : ''} transition-colors ${
                      hasPending ? 'bg-amber-50/50' :
                      hasCorrection ? 'bg-blue-50/50' :
                      isWeekend ? 'bg-gray-50/30' : 'hover:bg-gray-50/50'
                    } ${canEdit ? 'cursor-pointer' : ''}`}
                    onClick={() => { if (canEdit) onEditShift(sr.shift); }}
                  >
                    <td className="px-3 py-2.5 font-bold text-gray-700">{isFirst ? <>{day.dayName} <span className="font-normal text-gray-400 text-xs">{day.date.getMonth() + 1}/{day.date.getDate()}</span></> : ''}</td>
                    <td className="px-2 py-2.5 text-gray-600 whitespace-nowrap">
                      <CellValue
                        original={formatTimeEST(sr.shift.clock_in_time)}
                        proposed={hasCorrection ? formatTimeEST(sr.correction!.proposed_clock_in) : undefined}
                        changed={hasCorrection && sr.correction!.proposed_clock_in !== sr.correction!.original_clock_in}
                      />
                    </td>
                    <td className="px-2 py-2.5 text-gray-500 whitespace-nowrap text-[11px]">
                      {sr.breaks.length > 0 ? formatTimeEST(sr.breaks[0].break_start) : ''}
                    </td>
                    <td className="px-2 py-2.5 text-gray-500 whitespace-nowrap text-[11px]">
                      {sr.breaks.length > 0 && sr.breaks[0].break_end ? formatTimeEST(sr.breaks[0].break_end) : ''}
                    </td>
                    <td className="px-2 py-2.5 text-center text-green-700 font-medium text-[11px]">
                      {sr.breaks.length > 0 && sr.breaks[0].break_end ? (() => {
                        const start = new Date(sr.breaks[0].break_start).getTime();
                        const end = new Date(sr.breaks[0].break_end!).getTime();
                        const mins = Math.round((end - start) / 60000);
                        return mins > 0 ? formatHM(mins) : '';
                      })() : ''}
                    </td>
                    <td className="px-2 py-2.5 text-gray-600 whitespace-nowrap">
                      {sr.shift.clock_out_time ? (
                        <CellValue
                          original={formatTimeEST(sr.shift.clock_out_time)}
                          proposed={hasCorrection ? formatTimeEST(sr.correction!.proposed_clock_out) : undefined}
                          changed={hasCorrection && sr.correction!.proposed_clock_out !== sr.correction!.original_clock_out}
                        />
                      ) : (
                        <span className="text-green-600 text-[10px] font-bold">ACTIVE</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-center text-gray-400">-</td>
                    {isFirst ? (
                      <>
                        <td className="px-2 py-2.5 text-right font-medium text-gray-700" rowSpan={rowCount}>
                          {day.regMinutes > 0 ? formatDecimalHours(day.regMinutes) : ''}
                        </td>
                        <td className="px-2 py-2.5 text-right font-medium text-orange-600" rowSpan={rowCount}>
                          {day.otMinutes > 0 ? formatDecimalHours(day.otMinutes) : ''}
                        </td>
                        <td className={`px-3 py-2.5 text-right font-bold bg-blue-50/50 text-moja-blue`} rowSpan={rowCount}>
                          {day.netMinutes > 0 ? formatDecimalHours(day.netMinutes) : ''}
                        </td>
                      </>
                    ) : null}
                  </tr>
                  {hasNotes && (
                    <tr className={`border-b border-gray-100 ${hasPending ? 'bg-amber-50/30' : hasCorrection ? 'bg-blue-50/30' : ''}`}>
                      <td colSpan={10} className="px-3 pb-2 pt-0">
                        <div className="flex flex-wrap gap-1.5 pl-1">
                          {sr.pendingCorrection && (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                              <Clock className="w-2.5 h-2.5" />
                              Pending: {sr.pendingCorrection.proposed_hours != null
                                ? `${sr.pendingCorrection.proposed_hours}h`
                                : `${formatTimeEST(sr.pendingCorrection.proposed_clock_in)} - ${formatTimeEST(sr.pendingCorrection.proposed_clock_out)}`
                              }
                              {sr.pendingCorrection.note && ` - ${sr.pendingCorrection.note}`}
                            </span>
                          )}
                          {sr.rejectedCorrection && (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                              <XCircle className="w-2.5 h-2.5" /> Rejected{sr.rejectedCorrection.rejection_reason ? `: ${sr.rejectedCorrection.rejection_reason}` : ''}
                            </span>
                          )}
                          {sr.correction?.note && (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                              <Pencil className="w-2.5 h-2.5" /> {sr.correction.note}
                            </span>
                          )}
                          {sr.notes.map(note => (
                            <span key={note.id} className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${
                              note.status === 'resolved' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              <MessageSquare className="w-2.5 h-2.5" /> {note.body}
                              {note.resolution_comment && <span className="text-green-600 ml-1">- {note.resolution_comment}</span>}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </React.Fragment>
        );
      })}
      <tr className="bg-gray-100 border-t border-gray-200 font-bold text-xs">
        <td colSpan={7} className="px-3 py-2 text-gray-600">{week.label} Subtotal</td>
        <td className="px-2 py-2 text-right text-gray-700">{formatDecimalHours(week.regMinutes)}</td>
        <td className="px-2 py-2 text-right text-orange-600">{formatDecimalHours(week.otMinutes)}</td>
        <td className="px-3 py-2 text-right text-moja-blue bg-blue-50">{formatDecimalHours(week.totalMinutes)}</td>
      </tr>
    </>
  );
}

function CellValue({ original, proposed, changed }: { original: string; proposed?: string; changed?: boolean }) {
  if (!proposed || !changed) {
    return <span>{original}</span>;
  }
  return (
    <span>
      <span className="text-gray-400 line-through text-[10px]">{original}</span>
      <br />
      <span className="text-blue-700 font-semibold">{proposed}</span>
    </span>
  );
}
