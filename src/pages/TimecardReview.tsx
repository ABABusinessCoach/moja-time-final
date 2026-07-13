import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, CheckCircle, Clock, AlertTriangle, XCircle, FileText, RefreshCw, Radio, ChevronRight, ArrowLeft, Pencil, Save, X, Send, Users, Check } from 'lucide-react';
import { callTimecardFunction } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import { getPayPeriodForDate } from '../lib/payPeriod';
import { formatHM, formatHMFromHours } from '../lib/formatTime';

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

interface Report {
  id: string;
  staff_id: string;
  total_hours: number;
  overtime_hours: number;
  status: string;
  generated_at: string;
  pay_periods: { start_date: string; end_date: string } | null;
  staff: { name: string; email: string; employee_number: string | null } | null;
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
    employee_number: string | null;
    total_hours: number;
    overtime_hours: number;
    status: string;
    approved_at: string | null;
    admin_approved_at: string | null;
    pay_period: { start_date: string; end_date: string };
  };
  shifts: Shift[];
  breaks: BreakLog[];
  notes: ShiftNote[];
  corrections: Correction[];
}

const DAY_NAMES = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatTimeEST(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString('en-US', {
    timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit',
  });
}

function formatDecimalHours(mins: number): string {
  if (mins <= 0) return '';
  return formatHM(mins);
}

function formatDateShort(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getShiftDateKey(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

interface ShiftRow {
  shift: Shift;
  breaks: BreakLog[];
  correction: Correction | null;
  pendingCorrection: Correction | null;
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

function buildWeekBlocks(detail: ReportDetail): WeekBlock[] {
  const { report, shifts, breaks, corrections, notes } = detail;
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
      const shiftNotes = shift ? notes.filter(n => dayShifts.some(s => s.id === n.clock_log_id)) : [];

      let netMinutes = 0;
      const shiftRows: ShiftRow[] = [];
      for (const s of dayShifts) {
        const sBreaks = breaks.filter(b => b.clock_log_id === s.id);
        const sCorrection = corrections.find(c => c.clock_log_id === s.id && c.approval_status === 'approved') || null;
        const sPending = corrections.find(c => c.clock_log_id === s.id && c.approval_status === 'pending') || null;
        const sNotes = notes.filter(n => n.clock_log_id === s.id);
        const shiftMins = sCorrection
          ? Math.max(0, sCorrection.proposed_duration_minutes || 0)
          : Math.max(0, s.duration_minutes || 0);
        netMinutes += shiftMins;
        shiftRows.push({ shift: s, breaks: sBreaks, correction: sCorrection, pendingCorrection: sPending, notes: sNotes, shiftMinutes: shiftMins });
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
        notes: shiftNotes,
        netMinutes,
        regMinutes: 0,
        otMinutes: 0,
      });
    }

    const otMinutes = Math.max(0, weekNetTotal - OT_THRESHOLD);
    const regMinutes = weekNetTotal - otMinutes;

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

    const fmtDateKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    weeks.push({
      label: `Week ${w + 1}`,
      dateRange: `${formatDateShort(fmtDateKey(weekStart))} - ${formatDateShort(fmtDateKey(weekEnd))}`,
      days,
      totalMinutes: weekNetTotal,
      regMinutes,
      otMinutes,
    });
  }

  return weeks;
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
  const [view, setView] = useState<'pending' | 'approved'>('pending');
  const [periodFilter, setPeriodFilter] = useState<'current' | 'previous'>('current');
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  // Admin edit modal state
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [editClockIn, setEditClockIn] = useState('');
  const [editClockOut, setEditClockOut] = useState('');
  const [editBreakOut, setEditBreakOut] = useState('');
  const [editBreakIn, setEditBreakIn] = useState('');
  const [editNote, setEditNote] = useState('');
  const [savingCorrection, setSavingCorrection] = useState(false);

  // Admin add shift (empty day) state
  const [adminAddDate, setAdminAddDate] = useState<string | null>(null);
  const [adminAddNote, setAdminAddNote] = useState('');
  const [adminAddClockIn, setAdminAddClockIn] = useState('');
  const [adminAddClockOut, setAdminAddClockOut] = useState('');
  const [adminAddBreakOut, setAdminAddBreakOut] = useState('');
  const [adminAddBreakIn, setAdminAddBreakIn] = useState('');
  const [savingAdminAdd, setSavingAdminAdd] = useState(false);

  // Send timecards modal state
  const [showSendModal, setShowSendModal] = useState(false);
  const [staffList, setStaffList] = useState<{ id: string; name: string; email: string }[]>([]);
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [regenerateExisting, setRegenerateExisting] = useState(true);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [sendPeriod, setSendPeriod] = useState<'current' | 'previous'>('current');

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
    if (result.success) setSelectedReport(result);
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
    if (selectedReport) await loadDetail(selectedReport.report.id);
    await loadReports();
  }

  async function openSendModal() {
    setShowSendModal(true);
    setLoadingStaff(true);
    const { data } = await supabase.from('staff').select('id, name, email').eq('is_active', true).order('name');
    setStaffList(data || []);
    setSelectedStaffIds((data || []).map(s => s.id));
    setLoadingStaff(false);
  }

  function toggleStaff(id: string) {
    setSelectedStaffIds(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  }

  async function handleGenerate() {
    setGenerating(true);
    setShowSendModal(false);
    const token = await getAuthToken();
    const selectedPeriod = sendPeriod === 'current' ? currentPeriod : previousPeriod;
    const body: Record<string, unknown> = {
      regenerate: regenerateExisting,
      period_start: selectedPeriod.start,
      period_end: selectedPeriod.end,
    };
    if (selectedStaffIds.length < staffList.length) {
      body.staff_ids = selectedStaffIds;
    }
    const result = await callTimecardFunction('/generate', { body, authToken: token });
    setGenerating(false);
    setToast(result.success ? `Sent ${result.reports_generated} timecard(s) for approval` : (result.message || 'Failed'));
    setTimeout(() => setToast(null), 4000);
    if (result.success) await loadReports();
  }

  async function handleAdminApprove(reportId: string) {
    setApproving(true);
    const token = await getAuthToken();
    const result = await callTimecardFunction('/admin-approve', { body: { report_id: reportId }, authToken: token });
    setApproving(false);
    if (result.success) {
      setToast('Approved! Final hours email sent to employee.');
      await loadDetail(reportId);
      await loadReports();
    } else {
      setToast(result.message || 'Failed to approve');
    }
    setTimeout(() => setToast(null), 5000);
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

  function openAdminEditModal(shift: Shift) {
    setEditingShift(shift);
    const existingCorr = selectedReport?.corrections.find(c => c.clock_log_id === shift.id);
    if (existingCorr) {
      setEditClockIn(toESTInputTime(existingCorr.proposed_clock_in));
      setEditClockOut(toESTInputTime(existingCorr.proposed_clock_out));
      setEditNote(existingCorr.note || '');
    } else {
      setEditClockIn(toESTInputTime(shift.clock_in_time));
      setEditClockOut(shift.clock_out_time ? toESTInputTime(shift.clock_out_time) : '');
      setEditNote('');
    }

    const shiftBreaks = selectedReport?.breaks.filter(b => b.clock_log_id === shift.id) || [];
    const breakLog = shiftBreaks.find(b => b.break_type === 'break');
    setEditBreakOut(breakLog?.break_start ? toESTInputTime(breakLog.break_start) : '');
    setEditBreakIn(breakLog?.break_end ? toESTInputTime(breakLog.break_end) : '');
  }

  function openAdminAddShiftModal(dateKey: string) {
    setAdminAddDate(dateKey);
    setAdminAddNote('');
    setAdminAddClockIn('');
    setAdminAddClockOut('');
    setAdminAddBreakOut('');
    setAdminAddBreakIn('');
  }

  async function handleAdminAddShift() {
    if (!adminAddDate || !selectedReport) return;
    if (!adminAddClockIn || !adminAddClockOut) return;

    setSavingAdminAdd(true);
    const token = await getAuthToken();

    const body: Record<string, unknown> = {
      report_id: selectedReport.report.id,
      date: adminAddDate,
      note: adminAddNote.trim() || undefined,
      proposed_clock_in: toISOFromESTTime(adminAddDate, adminAddClockIn),
      proposed_clock_out: toISOFromESTTime(adminAddDate, adminAddClockOut),
    };

    if (adminAddBreakOut && adminAddBreakIn) {
      body.break_start = toISOFromESTTime(adminAddDate, adminAddBreakOut);
      body.break_end = toISOFromESTTime(adminAddDate, adminAddBreakIn);
    }

    const result = await callTimecardFunction('/admin-add-shift', {
      body,
      authToken: token,
    });
    if (result.success) {
      setAdminAddDate(null);
      setToast('Hours added');
      await loadDetail(selectedReport.report.id);
      await loadReports();
    } else {
      setToast(result.message || 'Failed to add');
    }
    setSavingAdminAdd(false);
    setTimeout(() => setToast(null), 4000);
  }

  async function handleApproveCorrection(correctionId: string) {
    const token = await getAuthToken();
    const result = await callTimecardFunction('/approve-correction', {
      body: { correction_id: correctionId },
      authToken: token,
    });
    if (result.success) {
      setToast('Correction approved');
      if (selectedReport) await loadDetail(selectedReport.report.id);
      await loadReports();
    } else {
      setToast(result.message || 'Failed to approve correction');
    }
    setTimeout(() => setToast(null), 4000);
  }

  async function handleRejectCorrection(correctionId: string) {
    const reason = prompt('Reason for rejection (optional):');
    const token = await getAuthToken();
    const result = await callTimecardFunction('/reject-correction', {
      body: { correction_id: correctionId, reason: reason || undefined },
      authToken: token,
    });
    if (result.success) {
      setToast('Correction rejected');
      if (selectedReport) await loadDetail(selectedReport.report.id);
      await loadReports();
    } else {
      setToast(result.message || 'Failed to reject correction');
    }
    setTimeout(() => setToast(null), 4000);
  }

  async function handleAdminSaveCorrection() {
    if (!editingShift || !editClockIn || !editClockOut || !selectedReport) return;
    setSavingCorrection(true);
    const token = await getAuthToken();
    const shiftDate = getShiftDateKey(editingShift.clock_in_time);
    const result = await callTimecardFunction('/admin-corrections', {
      body: {
        report_id: selectedReport.report.id,
        clock_log_id: editingShift.id,
        proposed_clock_in: toISOFromESTTime(shiftDate, editClockIn),
        proposed_clock_out: toISOFromESTTime(shiftDate, editClockOut),
        break_edits: {
          break_start: editBreakOut ? toISOFromESTTime(shiftDate, editBreakOut) : null,
          break_end: editBreakIn ? toISOFromESTTime(shiftDate, editBreakIn) : null,
        },
        note: editNote.trim() || null,
      },
      authToken: token,
    });
    if (result.success) {
      setEditingShift(null);
      await loadDetail(selectedReport.report.id);
    } else {
      setToast(result.message || 'Failed to save');
      setTimeout(() => setToast(null), 4000);
    }
    setSavingCorrection(false);
  }

  function formatDate(dateStr: string) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
    const { report, notes, corrections } = selectedReport;
    const openNotes = notes.filter(n => n.status !== 'resolved');
    const resolvedNotes = notes.filter(n => n.status === 'resolved');
    const weekBlocks = buildWeekBlocks(selectedReport);
    const periodTotal = weekBlocks.reduce((s, w) => s + w.totalMinutes, 0);
    const periodReg = weekBlocks.reduce((s, w) => s + w.regMinutes, 0);
    const periodOT = weekBlocks.reduce((s, w) => s + w.otMinutes, 0);
    const hasOpenShift = selectedReport.shifts.some(s => !s.clock_out_time);
    const canEdit = true;

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
            <h2 className="text-lg font-bold text-moja-blue">
              {report.employee_number && <span className="text-moja-blue/50 font-mono mr-2">#{report.employee_number}</span>}
              {report.staff_name}
            </h2>
            <p className="text-xs text-gray-400">
              {report.staff_email} &middot; {formatDate(report.pay_period.start_date)} - {formatDate(report.pay_period.end_date)}
            </p>
          </div>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${
            report.status === 'approved' ? 'bg-green-100 text-green-700' :
            report.status === 'employee_approved' ? 'bg-emerald-100 text-emerald-700' :
            report.status === 'has_notes' ? 'bg-amber-100 text-amber-700' :
            'bg-blue-100 text-blue-700'
          }`}>
            {report.status === 'approved' ? <><CheckCircle className="w-3.5 h-3.5" /> Fully Approved</> :
             report.status === 'employee_approved' ? <><CheckCircle className="w-3.5 h-3.5" /> Employee Approved</> :
             report.status === 'has_notes' ? <><MessageSquare className="w-3.5 h-3.5" /> Has Notes</> :
             <><Clock className="w-3.5 h-3.5" /> Pending</>}
          </span>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">Shifts</p>
            <p className="text-2xl font-bold text-moja-blue mt-1">{selectedReport.shifts.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">Net Hours</p>
            <p className="text-2xl font-bold text-moja-blue mt-1">{formatDecimalHours(periodTotal)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">Regular</p>
            <p className="text-2xl font-bold text-gray-700 mt-1">{formatDecimalHours(periodReg)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-[11px] text-orange-500 font-semibold uppercase tracking-wide">Overtime</p>
            <p className={`text-2xl font-bold mt-1 ${periodOT > 0 ? 'text-orange-500' : 'text-gray-300'}`}>
              {formatDecimalHours(periodOT) || '0:00'}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-[11px] text-blue-600 font-semibold uppercase tracking-wide">Corrections</p>
            <p className={`text-2xl font-bold mt-1 ${corrections.length > 0 ? 'text-blue-600' : 'text-gray-300'}`}>
              {corrections.length}
            </p>
          </div>
        </div>

        {hasOpenShift && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2 text-sm text-green-700 font-semibold">
            <Radio className="w-4 h-4 animate-pulse" /> Currently clocked in
          </div>
        )}

        {/* Timecard Table with inline notes */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm min-w-[750px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-3 py-2.5 font-bold text-gray-600 w-14">Day</th>
                  <th className="text-left px-2 py-2.5 font-bold text-gray-600">Start</th>
                  <th className="text-left px-2 py-2.5 font-bold text-green-700 text-[11px]">Break Out</th>
                  <th className="text-left px-2 py-2.5 font-bold text-green-700 text-[11px]">Break In</th>
                  <th className="text-left px-2 py-2.5 font-bold text-gray-600">End</th>
                  <th className="text-center px-2 py-2.5 font-bold text-gray-600">Vac/Sick</th>
                  <th className="text-right px-2 py-2.5 font-bold text-gray-600">Reg</th>
                  <th className="text-right px-2 py-2.5 font-bold text-orange-600">OT</th>
                  <th className="text-right px-3 py-2.5 font-bold text-moja-blue bg-blue-50">Total</th>
                </tr>
              </thead>
              <tbody>
                {weekBlocks.map((week, wi) => (
                  <AdminWeekSection key={wi} week={week} canEdit={canEdit} onEditShift={openAdminEditModal} onAddShift={openAdminAddShiftModal} onApproveCorrection={handleApproveCorrection} onRejectCorrection={handleRejectCorrection} />
                ))}
                <tr className="bg-gray-100 border-t-2 border-gray-300 font-bold">
                  <td colSpan={5} className="px-3 py-2.5 text-gray-700">Period Total</td>
                  <td className="px-2 py-2.5 text-right text-gray-700">{formatDecimalHours(periodReg)}</td>
                  <td className="px-2 py-2.5 text-right text-orange-600">{formatDecimalHours(periodOT)}</td>
                  <td className="px-3 py-2.5 text-right text-moja-blue bg-blue-50">{formatDecimalHours(periodTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Open Notes - Action required */}
        {openNotes.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-amber-700 uppercase tracking-wide flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Open Notes ({openNotes.length})
            </h3>
            {openNotes.map(note => {
              const relatedShift = selectedReport.shifts.find(s => s.id === note.clock_log_id);
              return (
                <div key={note.id} className="bg-white rounded-xl border-2 border-amber-200 p-4 space-y-3">
                  <div>
                    {relatedShift ? (
                      <p className="text-xs text-gray-400 font-semibold mb-1">
                        Shift: {new Date(relatedShift.clock_in_time).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' })} &middot;
                        {formatTimeEST(relatedShift.clock_in_time)} - {relatedShift.clock_out_time ? formatTimeEST(relatedShift.clock_out_time) : 'open'}
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
                        <button onClick={() => setResolveNoteId(null)} className="px-3 py-2 text-gray-400 text-xs font-bold hover:text-gray-600">Cancel</button>
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
                {note.resolution_comment && <p className="text-xs text-green-700 font-medium mt-1.5">Response: {note.resolution_comment}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Admin Approval Section */}
        {report.status === 'approved' ? (
          <div className="bg-green-50 border-2 border-green-200 rounded-xl p-5 text-center">
            <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
            <p className="font-bold text-green-800">Fully approved</p>
            {report.admin_approved_at && (
              <p className="text-xs text-green-600 mt-1">
                Admin approved on {new Date(report.admin_approved_at).toLocaleDateString('en-US', {
                  timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit'
                })}
              </p>
            )}
            <p className="text-xs text-green-600 mt-1">Final hours email was sent to {report.staff_email}.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border-2 border-green-200 p-6 text-center shadow-sm">
            {report.status === 'employee_approved' && (
              <p className="text-xs font-semibold text-blue-600 mb-3 bg-blue-50 rounded-lg px-3 py-1.5 inline-block">
                Employee approved on {report.approved_at ? new Date(report.approved_at).toLocaleDateString('en-US', {
                  timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                }) : 'N/A'}
              </p>
            )}
            <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-3" />
            <p className="font-bold text-gray-800 mb-1">Approve & Send Final Hours</p>
            <p className="text-sm text-gray-500 mb-4">
              This will finalize the timecard ({formatHM(periodTotal)}) and email the confirmed hours to {report.staff_name.split(' ')[0]}.
            </p>
            <button
              onClick={() => handleAdminApprove(report.id)}
              disabled={approving}
              className="inline-flex items-center gap-2 px-8 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg shadow-green-200"
            >
              {approving ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <CheckCircle className="w-5 h-5" />
              )}
              Approve & Send Email
            </button>
          </div>
        )}

        {/* Admin Edit Modal */}
        {editingShift && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setEditingShift(null)}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="bg-moja-blue p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-white font-bold text-lg">Override Shift Hours</h3>
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Clock In</label>
                    <input
                      type="time"
                      value={editClockIn}
                      onChange={e => setEditClockIn(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border-2 border-gray-200 rounded-lg focus:outline-none focus:border-moja-blue"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Clock Out</label>
                    <input
                      type="time"
                      value={editClockOut}
                      onChange={e => setEditClockOut(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border-2 border-gray-200 rounded-lg focus:outline-none focus:border-moja-blue"
                    />
                  </div>
                </div>
                <div className="border-t border-gray-100 pt-3">
                  <p className="text-[11px] font-semibold text-green-700 uppercase tracking-wide mb-2">Break (Paid)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">Break Out</label>
                      <input
                        type="time"
                        value={editBreakOut}
                        onChange={e => setEditBreakOut(e.target.value)}
                        className="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-lg focus:outline-none focus:border-green-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">Break In</label>
                      <input
                        type="time"
                        value={editBreakIn}
                        onChange={e => setEditBreakIn(e.target.value)}
                        className="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-lg focus:outline-none focus:border-green-500"
                      />
                    </div>
                  </div>
                </div>
                {editClockIn && editClockOut && (() => {
                  const [hIn, mIn] = editClockIn.split(':').map(Number);
                  const [hOut, mOut] = editClockOut.split(':').map(Number);
                  const grossMins = Math.max(0, (hOut * 60 + mOut) - (hIn * 60 + mIn));
                  const oldMins = editingShift.duration_minutes || 0;
                  const diff = grossMins - oldMins;
                  const newPeriodTotal = periodTotal + diff;
                  return (
                    <div className="bg-blue-50 rounded-lg p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-blue-600 font-medium">Net shift hours:</span>
                        <span className="text-sm font-bold text-blue-700">
                          {formatHM(grossMins)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-t border-blue-100 pt-1.5">
                        <span className="text-xs text-blue-600 font-medium">New period total:</span>
                        <span className="text-sm font-bold text-blue-800">
                          {formatHM(newPeriodTotal)}
                          {diff !== 0 && (
                            <span className={`ml-1.5 text-[11px] ${diff > 0 ? 'text-green-600' : 'text-red-500'}`}>
                              ({diff > 0 ? '+' : ''}{formatHM(Math.abs(diff))})
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })()}
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Note (optional)</label>
                  <textarea
                    value={editNote}
                    onChange={e => setEditNote(e.target.value)}
                    placeholder="e.g., Adjusted per employee request"
                    rows={2}
                    className="w-full px-3 py-2.5 text-sm border-2 border-gray-200 rounded-lg focus:outline-none focus:border-moja-blue resize-none"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleAdminSaveCorrection}
                    disabled={savingCorrection || !editClockIn || !editClockOut}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-moja-blue text-white font-bold rounded-xl hover:bg-moja-blue/90 disabled:opacity-40 transition-all"
                  >
                    {savingCorrection ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <><Save className="w-4 h-4" /> Save Override</>
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

        {/* Admin Add Shift Modal (empty day) */}
        {adminAddDate && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setAdminAddDate(null)}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="bg-moja-blue p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-white font-bold text-lg">Add Hours</h3>
                    <p className="text-white/60 text-sm">
                      {(() => { const [y, m, d] = adminAddDate.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }); })()}
                    </p>
                  </div>
                  <button onClick={() => setAdminAddDate(null)} className="p-2 text-white/50 hover:text-white rounded-lg transition-colors">
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
                      value={adminAddClockIn}
                      onChange={e => setAdminAddClockIn(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border-2 border-gray-200 rounded-lg focus:outline-none focus:border-moja-blue"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Clock Out</label>
                    <input
                      type="time"
                      value={adminAddClockOut}
                      onChange={e => setAdminAddClockOut(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border-2 border-gray-200 rounded-lg focus:outline-none focus:border-moja-blue"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-green-700 uppercase tracking-wide mb-1 block">Break Out</label>
                    <input
                      type="time"
                      value={adminAddBreakOut}
                      onChange={e => setAdminAddBreakOut(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border-2 border-gray-200 rounded-lg focus:outline-none focus:border-green-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-green-700 uppercase tracking-wide mb-1 block">Break In</label>
                    <input
                      type="time"
                      value={adminAddBreakIn}
                      onChange={e => setAdminAddBreakIn(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border-2 border-gray-200 rounded-lg focus:outline-none focus:border-green-500"
                    />
                  </div>
                </div>
                {adminAddClockIn && adminAddClockOut && (() => {
                  const [hIn, mIn] = adminAddClockIn.split(':').map(Number);
                  const [hOut, mOut] = adminAddClockOut.split(':').map(Number);
                  const grossMins = Math.max(0, (hOut * 60 + mOut) - (hIn * 60 + mIn));
                  let breakMins = 0;
                  if (adminAddBreakOut && adminAddBreakIn) {
                    const [bOutH, bOutM] = adminAddBreakOut.split(':').map(Number);
                    const [bInH, bInM] = adminAddBreakIn.split(':').map(Number);
                    breakMins = Math.max(0, (bInH * 60 + bInM) - (bOutH * 60 + bOutM));
                  }
                  const netMins = Math.max(0, grossMins - breakMins);
                  const newPeriodTotal = periodTotal + netMins;
                  return (
                    <div className="bg-blue-50 rounded-lg p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-blue-600 font-medium">Net shift hours:</span>
                        <span className="text-sm font-bold text-blue-700">{formatHM(netMins)}</span>
                      </div>
                      {breakMins > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-green-600 font-medium">Break deducted:</span>
                          <span className="text-sm font-bold text-green-700">-{formatHM(breakMins)}</span>
                        </div>
                      )}
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
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Note (optional)</label>
                  <textarea
                    value={adminAddNote}
                    onChange={e => setAdminAddNote(e.target.value)}
                    placeholder="e.g., Employee worked off-site"
                    rows={2}
                    className="w-full px-3 py-2.5 text-sm border-2 border-gray-200 rounded-lg focus:outline-none focus:border-moja-blue resize-none"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleAdminAddShift}
                    disabled={savingAdminAdd || !adminAddClockIn || !adminAddClockOut}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-moja-blue text-white font-bold rounded-xl hover:bg-moja-blue/90 disabled:opacity-40 transition-all"
                  >
                    {savingAdminAdd ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <><Save className="w-4 h-4" /> Add Hours</>
                    )}
                  </button>
                  <button
                    onClick={() => setAdminAddDate(null)}
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

  // === LIST VIEW ===
  // Calculate current and previous pay periods from the pay period utility
  const currentPeriod = getPayPeriodForDate(new Date());
  const prevDate = new Date();
  prevDate.setDate(prevDate.getDate() - 14);
  const previousPeriod = getPayPeriodForDate(prevDate);
  const currentPeriodKey = currentPeriod.start;
  const previousPeriodKey = previousPeriod.start;

  function filterByPeriod(list: Report[]): Report[] {
    const targetKey = periodFilter === 'current' ? currentPeriodKey : previousPeriodKey;
    if (!targetKey) return list;
    return list.filter(r => r.pay_periods?.start_date === targetKey);
  }

  const baseReports = view === 'pending' ? reports : allReports;
  const displayReports = filterByPeriod(baseReports);
  const currentPeriodLabel = `${formatDate(currentPeriod.start)} - ${formatDate(currentPeriod.end)}`;
  const previousPeriodLabel = `${formatDate(previousPeriod.start)} - ${formatDate(previousPeriod.end)}`;

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
          <button onClick={() => loadReports()} className="p-2 text-gray-400 hover:text-moja-blue rounded-lg transition-colors" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={openSendModal}
            disabled={generating}
            className="inline-flex items-center gap-2 px-4 py-2 bg-moja-orange text-white text-sm font-bold rounded-lg hover:bg-moja-orange/90 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {generating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send Timecards
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setView('pending')}
            className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${
              view === 'pending' ? 'bg-white text-moja-blue shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Needs Review ({filterByPeriod(reports).length})
          </button>
          <button
            onClick={() => setView('approved')}
            className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${
              view === 'approved' ? 'bg-white text-moja-blue shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Approved ({filterByPeriod(allReports).length})
          </button>
        </div>

        {previousPeriodKey && (
          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value as 'current' | 'previous')}
            className="h-9 px-3 pr-8 text-sm font-bold text-moja-blue bg-white border-2 border-moja-blue/20 rounded-lg focus:border-moja-blue focus:outline-none appearance-none cursor-pointer"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%231B3A5C' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
          >
            <option value="current">Current ({currentPeriodLabel})</option>
            <option value="previous">Previous ({previousPeriodLabel})</option>
          </select>
        )}
      </div>

      {displayReports.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <CheckCircle className="w-12 h-12 text-green-300 mx-auto mb-3" />
          <p className="text-lg font-bold text-gray-400">
            {view === 'pending' ? 'All caught up!' : 'No approved timecards yet'}
          </p>
          <p className="text-sm text-gray-300 mt-1">
            {view === 'pending' ? 'No timecards need your attention right now.' : 'Timecards will appear here after admin approval.'}
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
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    report.status === 'has_notes' ? 'bg-amber-100' :
                    report.status === 'approved' ? 'bg-green-100' :
                    report.status === 'employee_approved' ? 'bg-emerald-100' : 'bg-blue-100'
                  }`}>
                    {report.status === 'has_notes' ? <MessageSquare className="w-5 h-5 text-amber-600" /> :
                     report.status === 'approved' ? <CheckCircle className="w-5 h-5 text-green-600" /> :
                     report.status === 'employee_approved' ? <CheckCircle className="w-5 h-5 text-emerald-600" /> :
                     <Clock className="w-5 h-5 text-blue-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-gray-800 truncate">
                        {report.staff?.employee_number && <span className="text-gray-400 font-mono text-xs mr-1.5">#{report.staff.employee_number}</span>}
                        {report.staff?.name || 'Unknown'}
                      </p>
                      {report.has_open_shift && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-[10px] font-bold flex-shrink-0">
                          <Radio className="w-2.5 h-2.5 animate-pulse" /> LIVE
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 font-medium mt-0.5">
                      {report.pay_periods ? `${formatDate(report.pay_periods.start_date)} - ${formatDate(report.pay_periods.end_date)}` : ''}
                      {report.shift_count !== undefined && <span className="ml-2 text-gray-300">{report.shift_count} shifts</span>}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold text-moja-blue">{formatHMFromHours(liveHours)}</p>
                    {report.overtime_hours > 0 && (
                      <span className="text-xs text-orange-500 font-semibold">+{formatHMFromHours(report.overtime_hours)} OT</span>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-moja-blue transition-colors flex-shrink-0" />
                </div>
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

      {showSendModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowSendModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-moja-blue p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-white font-bold text-lg">Send Timecards</h3>
                  <p className="text-white/60 text-sm">Select which staff to send timecards to</p>
                </div>
                <button onClick={() => setShowSendModal(false)} className="p-2 text-white/50 hover:text-white rounded-lg transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-5 space-y-4">
              {/* Pay Period Selector */}
              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Pay Period</label>
                <select
                  value={sendPeriod}
                  onChange={e => setSendPeriod(e.target.value as 'current' | 'previous')}
                  className="w-full h-11 px-3 pr-10 text-sm font-semibold text-gray-800 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-moja-blue focus:outline-none appearance-none cursor-pointer"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%231B3A5C' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
                >
                  <option value="current">Current: {formatDateShort(currentPeriod.start)} - {formatDateShort(currentPeriod.end)}</option>
                  <option value="previous">Previous: {formatDateShort(previousPeriod.start)} - {formatDateShort(previousPeriod.end)}</option>
                </select>
              </div>
              {loadingStaff ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-moja-blue border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setSelectedStaffIds(
                        selectedStaffIds.length === staffList.length ? [] : staffList.map(s => s.id)
                      )}
                      className="text-xs font-bold text-moja-blue hover:text-moja-orange transition-colors"
                    >
                      {selectedStaffIds.length === staffList.length ? 'Deselect All' : 'Select All'}
                    </button>
                    <span className="text-xs text-gray-400 font-medium">
                      {selectedStaffIds.length} of {staffList.length} selected
                    </span>
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-1 border border-gray-100 rounded-xl p-2">
                    {staffList.map(staff => (
                      <button
                        key={staff.id}
                        onClick={() => toggleStaff(staff.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                          selectedStaffIds.includes(staff.id)
                            ? 'bg-blue-50 border border-blue-200'
                            : 'hover:bg-gray-50 border border-transparent'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border-2 transition-all ${
                          selectedStaffIds.includes(staff.id)
                            ? 'bg-moja-blue border-moja-blue'
                            : 'border-gray-300'
                        }`}>
                          {selectedStaffIds.includes(staff.id) && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm text-gray-800 truncate">{staff.name}</p>
                          <p className="text-xs text-gray-400 truncate">{staff.email}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                  <label className="flex items-center gap-3 px-3 py-3 bg-amber-50 border border-amber-200 rounded-xl cursor-pointer">
                    <input
                      type="checkbox"
                      checked={regenerateExisting}
                      onChange={e => setRegenerateExisting(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-moja-blue focus:ring-moja-blue"
                    />
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Re-send existing timecards</p>
                      <p className="text-xs text-gray-500">Regenerate and re-email staff who already received one</p>
                    </div>
                  </label>
                </>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleGenerate}
                  disabled={selectedStaffIds.length === 0 || generating}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-moja-orange text-white font-bold rounded-xl hover:bg-moja-orange/90 disabled:opacity-40 transition-all"
                >
                  {generating ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <><Send className="w-4 h-4" /> Send to {selectedStaffIds.length} Staff</>
                  )}
                </button>
                <button
                  onClick={() => setShowSendModal(false)}
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

function AdminWeekSection({ week, canEdit, onEditShift, onAddShift, onApproveCorrection, onRejectCorrection }: {
  week: WeekBlock;
  canEdit: boolean;
  onEditShift: (shift: Shift) => void;
  onAddShift: (dateKey: string) => void;
  onApproveCorrection?: (correctionId: string) => void;
  onRejectCorrection?: (correctionId: string) => void;
}) {
  return (
    <>
      <tr className="bg-gray-100/70 border-t border-gray-200">
        <td colSpan={9} className="px-3 py-2 font-bold text-gray-600 text-xs">
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
              const hasNotes = (sr?.notes.length || 0) > 0 || !!sr?.correction?.note || hasPending;
              return (
                <>
                  <tr
                    className={`border-b ${hasNotes ? 'border-b-0' : 'border-gray-100'} last:border-0 transition-colors ${
                      hasPending ? 'bg-amber-50/60' :
                      hasCorrection ? 'bg-blue-50/60' : isWeekend ? 'bg-gray-50/30' : 'hover:bg-gray-50/50'
                    } ${canEdit ? 'cursor-pointer' : ''}`}
                    onClick={() => { if (canEdit && sr) onEditShift(sr.shift); else if (canEdit && !sr) onAddShift(day.dateKey); }}
                  >
                    <td className="px-3 py-2.5 font-bold text-gray-700">{day.dayName}</td>
                    <td className="px-2 py-2.5 whitespace-nowrap">
                      {sr ? (
                        <AdminCellValue
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
                    <td className="px-2 py-2.5 whitespace-nowrap">
                      {sr?.shift.clock_out_time ? (
                        <AdminCellValue
                          original={formatTimeEST(sr.shift.clock_out_time)}
                          proposed={hasCorrection ? formatTimeEST(sr.correction!.proposed_clock_out) : undefined}
                          changed={hasCorrection && sr.correction!.proposed_clock_out !== sr.correction!.original_clock_out}
                        />
                      ) : sr ? (
                        <span className="inline-flex items-center gap-1 text-green-600 text-[10px] font-bold">
                          <Radio className="w-3 h-3 animate-pulse" /> ACTIVE
                        </span>
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
                      <td colSpan={9} className="px-3 pb-2 pt-0">
                        <div className="flex flex-wrap gap-1.5 pl-1 items-center">
                          {sr?.pendingCorrection && (
                            <div className="inline-flex items-center gap-2 text-[10px] bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full font-medium" onClick={e => e.stopPropagation()}>
                              <Clock className="w-2.5 h-2.5" />
                              <span>
                                Employee requests: {sr.pendingCorrection.proposed_hours != null
                                  ? `${sr.pendingCorrection.proposed_hours}h`
                                  : `${formatTimeEST(sr.pendingCorrection.proposed_clock_in)} - ${formatTimeEST(sr.pendingCorrection.proposed_clock_out)}`
                                }
                                {sr.pendingCorrection.note && ` - "${sr.pendingCorrection.note}"`}
                              </span>
                              {onApproveCorrection && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); onApproveCorrection(sr.pendingCorrection!.id); }}
                                  className="ml-1 px-1.5 py-0.5 bg-green-600 text-white rounded text-[9px] font-bold hover:bg-green-700"
                                >
                                  Approve
                                </button>
                              )}
                              {onRejectCorrection && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); onRejectCorrection(sr.pendingCorrection!.id); }}
                                  className="px-1.5 py-0.5 bg-red-500 text-white rounded text-[9px] font-bold hover:bg-red-600"
                                >
                                  Reject
                                </button>
                              )}
                            </div>
                          )}
                          {sr?.correction?.note && (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                              <Pencil className="w-2.5 h-2.5" /> {sr.correction.note}
                            </span>
                          )}
                          {(sr?.notes || []).map(note => (
                            <span key={note.id} className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${
                              note.author_type === 'manager'
                                ? 'bg-purple-100 text-purple-700'
                                : note.status === 'resolved' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
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
              const hasNotes = sr.notes.length > 0 || !!sr.correction?.note || hasPending;
              const isFirst = si === 0;
              const isLast = si === day.shiftRows.length - 1;
              return (
                <React.Fragment key={sr.shift.id}>
                  <tr
                    className={`${isLast ? 'border-b border-gray-100' : ''} transition-colors ${
                      hasPending ? 'bg-amber-50/60' :
                      hasCorrection ? 'bg-blue-50/60' : isWeekend ? 'bg-gray-50/30' : 'hover:bg-gray-50/50'
                    } ${canEdit ? 'cursor-pointer' : ''}`}
                    onClick={() => { if (canEdit) onEditShift(sr.shift); }}
                  >
                    <td className="px-3 py-2.5 font-bold text-gray-700">{isFirst ? day.dayName : ''}</td>
                    <td className="px-2 py-2.5 whitespace-nowrap">
                      <AdminCellValue
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
                    <td className="px-2 py-2.5 whitespace-nowrap">
                      {sr.shift.clock_out_time ? (
                        <AdminCellValue
                          original={formatTimeEST(sr.shift.clock_out_time)}
                          proposed={hasCorrection ? formatTimeEST(sr.correction!.proposed_clock_out) : undefined}
                          changed={hasCorrection && sr.correction!.proposed_clock_out !== sr.correction!.original_clock_out}
                        />
                      ) : (
                        <span className="inline-flex items-center gap-1 text-green-600 text-[10px] font-bold">
                          <Radio className="w-3 h-3 animate-pulse" /> ACTIVE
                        </span>
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
                      <td colSpan={9} className="px-3 pb-2 pt-0">
                        <div className="flex flex-wrap gap-1.5 pl-1 items-center">
                          {sr.pendingCorrection && (
                            <div className="inline-flex items-center gap-2 text-[10px] bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full font-medium" onClick={e => e.stopPropagation()}>
                              <Clock className="w-2.5 h-2.5" />
                              <span>
                                Employee requests: {sr.pendingCorrection.proposed_hours != null
                                  ? `${sr.pendingCorrection.proposed_hours}h`
                                  : `${formatTimeEST(sr.pendingCorrection.proposed_clock_in)} - ${formatTimeEST(sr.pendingCorrection.proposed_clock_out)}`
                                }
                                {sr.pendingCorrection.note && ` - "${sr.pendingCorrection.note}"`}
                              </span>
                              {onApproveCorrection && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); onApproveCorrection(sr.pendingCorrection!.id); }}
                                  className="ml-1 px-1.5 py-0.5 bg-green-600 text-white rounded text-[9px] font-bold hover:bg-green-700"
                                >
                                  Approve
                                </button>
                              )}
                              {onRejectCorrection && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); onRejectCorrection(sr.pendingCorrection!.id); }}
                                  className="px-1.5 py-0.5 bg-red-500 text-white rounded text-[9px] font-bold hover:bg-red-600"
                                >
                                  Reject
                                </button>
                              )}
                            </div>
                          )}
                          {sr.correction?.note && (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                              <Pencil className="w-2.5 h-2.5" /> {sr.correction.note}
                            </span>
                          )}
                          {sr.notes.map(note => (
                            <span key={note.id} className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${
                              note.author_type === 'manager'
                                ? 'bg-purple-100 text-purple-700'
                                : note.status === 'resolved' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
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
        <td colSpan={6} className="px-3 py-2 text-gray-600">{week.label} Subtotal</td>
        <td className="px-2 py-2 text-right text-gray-700">{formatDecimalHours(week.regMinutes)}</td>
        <td className="px-2 py-2 text-right text-orange-600">{formatDecimalHours(week.otMinutes)}</td>
        <td className="px-3 py-2 text-right text-moja-blue bg-blue-50">{formatDecimalHours(week.totalMinutes)}</td>
      </tr>
    </>
  );
}

function AdminCellValue({ original, proposed, changed }: { original: string; proposed?: string; changed?: boolean }) {
  if (!proposed || !changed) {
    return <span className="text-gray-600">{original}</span>;
  }
  return (
    <span>
      <span className="text-red-500 line-through text-[10px]">{original}</span>
      <br />
      <span className="text-green-700 font-semibold">{proposed}</span>
    </span>
  );
}
