import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
  History, Edit3, Plus, Trash2, LogOut, CheckCircle, XCircle,
  MessageSquare, ClipboardCheck, FileText, Search, Filter,
  ChevronDown, ChevronUp, Clock, UserCheck, AlertTriangle,
  RefreshCw,
} from 'lucide-react';

const TZ = 'America/New_York';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtShort(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: TZ, month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

interface UnifiedEvent {
  id: string;
  timestamp: string;
  category: string;
  action: string;
  staffName: string;
  adminName: string | null;
  summary: string;
  detail?: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
}

const CATEGORY_CONFIG: Record<string, { label: string; color: string; icon: typeof Edit3 }> = {
  clock_edit:          { label: 'Clock Edit',          color: 'bg-blue-50 text-blue-700 border-blue-200',             icon: Edit3 },
  clock_add:           { label: 'Clock Add',           color: 'bg-emerald-50 text-emerald-700 border-emerald-200',     icon: Plus },
  clock_delete:        { label: 'Clock Delete',        color: 'bg-red-50 text-red-700 border-red-200',                 icon: Trash2 },
  force_clock_out:     { label: 'Force Clock Out',     color: 'bg-amber-50 text-amber-700 border-amber-200',           icon: LogOut },
  timecard_approved:   { label: 'Timecard Approved',   color: 'bg-green-50 text-green-700 border-green-200',           icon: CheckCircle },
  timecard_sent:       { label: 'Timecard Sent',       color: 'bg-sky-50 text-sky-700 border-sky-200',                 icon: FileText },
  correction_request:  { label: 'Correction Request',  color: 'bg-orange-50 text-orange-700 border-orange-200',        icon: AlertTriangle },
  correction_approved: { label: 'Correction Approved', color: 'bg-green-50 text-green-700 border-green-200',           icon: UserCheck },
  correction_rejected: { label: 'Correction Rejected', color: 'bg-red-50 text-red-700 border-red-200',                 icon: XCircle },
  employee_note:       { label: 'Employee Note',       color: 'bg-purple-50 text-purple-700 border-purple-200',        icon: MessageSquare },
  note_resolved:       { label: 'Note Resolved',       color: 'bg-teal-50 text-teal-700 border-teal-200',             icon: ClipboardCheck },
  employee_approved:   { label: 'Employee Approved',   color: 'bg-lime-50 text-lime-700 border-lime-200',             icon: CheckCircle },
};

const CATEGORY_OPTIONS = [
  { value: '', label: 'All Events' },
  { value: 'clock_edit', label: 'Clock Edits' },
  { value: 'clock_add', label: 'Clock Additions' },
  { value: 'clock_delete', label: 'Clock Deletions' },
  { value: 'force_clock_out', label: 'Force Clock Outs' },
  { value: 'timecard_approved', label: 'Timecard Approvals' },
  { value: 'timecard_sent', label: 'Timecards Sent' },
  { value: 'correction_request', label: 'Correction Requests' },
  { value: 'correction_approved', label: 'Corrections Approved' },
  { value: 'correction_rejected', label: 'Corrections Rejected' },
  { value: 'employee_note', label: 'Employee Notes' },
  { value: 'note_resolved', label: 'Notes Resolved' },
  { value: 'employee_approved', label: 'Employee Approvals' },
];

export function AuditLog() {
  const [events, setEvents] = useState<UnifiedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(50);

  useEffect(() => {
    loadAllEvents();
  }, []);

  async function loadAllEvents() {
    setLoading(true);
    try {
      const [auditRes, timecardRes, correctionRes, noteRes] = await Promise.all([
        supabase
          .from('audit_log')
          .select('*, admins:admin_id(name), staff:target_staff_id(name)')
          .order('created_at', { ascending: false }),
        supabase
          .from('timecard_reports')
          .select('*, staff:staff_id(name), approver:admin_approved_by(name)')
          .order('created_at', { ascending: false }),
        supabase
          .from('timecard_corrections')
          .select('*, report:timecard_report_id(staff_id, staff:staff_id(name)), approver:approved_by(name)')
          .order('created_at', { ascending: false }),
        supabase
          .from('shift_notes')
          .select('*, report:timecard_report_id(staff_id, staff:staff_id(name))')
          .order('created_at', { ascending: false }),
      ]);

      const unified: UnifiedEvent[] = [];

      // Audit log entries (clock edits, adds, deletes, force clock-outs)
      if (auditRes.data) {
        for (const log of auditRes.data) {
          const actionMap: Record<string, string> = {
            manual_edit: 'clock_edit',
            manual_add: 'clock_add',
            manual_delete: 'clock_delete',
            force_clock_out: 'force_clock_out',
          };
          unified.push({
            id: `audit-${log.id}`,
            timestamp: log.created_at,
            category: actionMap[log.action] || log.action,
            action: log.action,
            staffName: log.staff?.name || 'Unknown',
            adminName: log.admins?.name || null,
            summary: log.reason || actionLabel(log.action),
            oldValues: log.old_values,
            newValues: log.new_values,
          });
        }
      }

      // Timecard events
      if (timecardRes.data) {
        for (const tc of timecardRes.data) {
          // When timecard was generated/sent
          unified.push({
            id: `tc-sent-${tc.id}`,
            timestamp: tc.generated_at || tc.created_at,
            category: 'timecard_sent',
            action: 'timecard_sent',
            staffName: tc.staff?.name || 'Unknown',
            adminName: null,
            summary: `Timecard generated — ${tc.total_hours?.toFixed(1) || '0'}h total, ${tc.overtime_hours?.toFixed(1) || '0'}h overtime`,
          });

          // Employee self-approval (status changed to approved and there's no admin approval yet, or approved_at exists)
          if (tc.approved_at && tc.status !== 'pending_review') {
            unified.push({
              id: `tc-emp-${tc.id}`,
              timestamp: tc.approved_at,
              category: 'employee_approved',
              action: 'employee_approved',
              staffName: tc.staff?.name || 'Unknown',
              adminName: null,
              summary: 'Employee reviewed and approved their timecard',
            });
          }

          // Admin approval
          if (tc.admin_approved_at) {
            unified.push({
              id: `tc-admin-${tc.id}`,
              timestamp: tc.admin_approved_at,
              category: 'timecard_approved',
              action: 'timecard_approved',
              staffName: tc.staff?.name || 'Unknown',
              adminName: tc.approver?.name || 'Admin',
              summary: `Timecard approved — ${tc.total_hours?.toFixed(1) || '0'}h total`,
            });
          }
        }
      }

      // Correction requests and resolutions
      if (correctionRes.data) {
        for (const c of correctionRes.data) {
          const staffName = c.report?.staff?.name || 'Unknown';

          // Correction submitted
          unified.push({
            id: `corr-req-${c.id}`,
            timestamp: c.created_at,
            category: 'correction_request',
            action: 'correction_request',
            staffName,
            adminName: null,
            summary: c.note || 'Correction requested',
            detail: buildCorrectionDetail(c),
          });

          // Correction approved/rejected
          if (c.approval_status === 'approved' && c.approved_at) {
            unified.push({
              id: `corr-appr-${c.id}`,
              timestamp: c.approved_at,
              category: 'correction_approved',
              action: 'correction_approved',
              staffName,
              adminName: c.approver?.name || 'Admin',
              summary: c.note || 'Correction approved',
            });
          } else if (c.approval_status === 'rejected' && c.approved_at) {
            unified.push({
              id: `corr-rej-${c.id}`,
              timestamp: c.approved_at,
              category: 'correction_rejected',
              action: 'correction_rejected',
              staffName,
              adminName: c.approver?.name || 'Admin',
              summary: c.rejection_reason || 'Correction rejected',
            });
          }
        }
      }

      // Shift notes
      if (noteRes.data) {
        for (const n of noteRes.data) {
          const staffName = n.report?.staff?.name || 'Unknown';
          const isEmployee = n.author_type === 'employee';

          unified.push({
            id: `note-${n.id}`,
            timestamp: n.created_at,
            category: isEmployee ? 'employee_note' : 'note_resolved',
            action: isEmployee ? 'employee_note' : 'manager_note',
            staffName,
            adminName: isEmployee ? null : 'Admin',
            summary: n.body || 'Note added',
          });

          if (n.status === 'resolved' && n.resolved_at) {
            unified.push({
              id: `note-res-${n.id}`,
              timestamp: n.resolved_at,
              category: 'note_resolved',
              action: 'note_resolved',
              staffName,
              adminName: 'Admin',
              summary: n.resolution_comment || 'Note resolved',
            });
          }
        }
      }

      unified.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setEvents(unified);
    } catch {
      // leave empty on error
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    let result = events;
    if (categoryFilter) {
      result = result.filter(e => e.category === categoryFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(e =>
        e.staffName.toLowerCase().includes(q) ||
        e.summary.toLowerCase().includes(q) ||
        (e.adminName && e.adminName.toLowerCase().includes(q))
      );
    }
    return result;
  }, [events, categoryFilter, searchQuery]);

  const displayed = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  // Group by date for timeline
  const grouped = useMemo(() => {
    const groups: { date: string; events: UnifiedEvent[] }[] = [];
    let currentDate = '';
    for (const event of displayed) {
      const d = new Date(event.timestamp).toLocaleDateString('en-US', {
        timeZone: TZ, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      });
      if (d !== currentDate) {
        currentDate = d;
        groups.push({ date: d, events: [] });
      }
      groups[groups.length - 1].events.push(event);
    }
    return groups;
  }, [displayed]);

  // Category counts for summary
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events) {
      counts[e.category] = (counts[e.category] || 0) + 1;
    }
    return counts;
  }, [events]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-6 h-6 text-moja-blue/30 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <History className="w-6 h-6 text-moja-blue" />
          <div>
            <h2 className="text-2xl font-bold text-moja-blue">Audit Log</h2>
            <p className="text-sm text-moja-blue/40 font-medium">{events.length.toLocaleString()} total events</p>
          </div>
        </div>
        <button
          onClick={() => { setVisibleCount(50); loadAllEvents(); }}
          className="p-2 text-gray-400 hover:text-moja-blue rounded-lg transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryCard label="Clock Edits" count={(categoryCounts.clock_edit || 0) + (categoryCounts.clock_add || 0) + (categoryCounts.clock_delete || 0)} color="bg-blue-500" />
        <SummaryCard label="Timecards Approved" count={categoryCounts.timecard_approved || 0} color="bg-green-500" />
        <SummaryCard label="Corrections" count={(categoryCounts.correction_request || 0)} color="bg-orange-500" />
        <SummaryCard label="Approved Corrections" count={categoryCounts.correction_approved || 0} color="bg-emerald-500" />
        <SummaryCard label="Employee Notes" count={categoryCounts.employee_note || 0} color="bg-purple-500" />
        <SummaryCard label="Force Clock Outs" count={categoryCounts.force_clock_out || 0} color="bg-amber-500" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by employee name, admin, or description..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setVisibleCount(50); }}
            className="w-full pl-10 pr-4 py-2.5 text-sm border-2 border-gray-200 rounded-xl focus:border-moja-blue focus:ring-0 font-medium"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <select
            value={categoryFilter}
            onChange={e => { setCategoryFilter(e.target.value); setVisibleCount(50); }}
            className="pl-10 pr-8 py-2.5 text-sm border-2 border-gray-200 rounded-xl focus:border-moja-blue focus:ring-0 font-semibold text-gray-700 appearance-none bg-white cursor-pointer"
          >
            {CATEGORY_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Timeline */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center shadow-sm">
          <History className="w-10 h-10 text-moja-blue/20 mx-auto mb-3" />
          <p className="text-moja-blue/40 font-bold">No events found</p>
          <p className="text-sm text-moja-blue/30 mt-1">
            {searchQuery || categoryFilter ? 'Try adjusting your filters' : 'Activity will appear here as actions are taken'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(group => (
            <div key={group.date}>
              {/* Date header */}
              <div className="flex items-center gap-3 mb-3">
                <div className="w-2 h-2 rounded-full bg-moja-orange" />
                <p className="text-sm font-bold text-moja-blue/60">{group.date}</p>
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs font-semibold text-moja-blue/30">{group.events.length} event{group.events.length !== 1 ? 's' : ''}</span>
              </div>

              {/* Events */}
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm divide-y divide-gray-50">
                {group.events.map(event => {
                  const config = CATEGORY_CONFIG[event.category] || { label: event.category, color: 'bg-gray-50 text-gray-700 border-gray-200', icon: Clock };
                  const Icon = config.icon;
                  const isExpanded = expandedId === event.id;
                  const hasExpandable = event.oldValues || event.newValues || event.detail;

                  return (
                    <div
                      key={event.id}
                      className={`px-5 py-3.5 transition-colors ${hasExpandable ? 'cursor-pointer hover:bg-gray-50/50' : ''}`}
                      onClick={() => hasExpandable && setExpandedId(isExpanded ? null : event.id)}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <div className={`mt-0.5 inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-full border whitespace-nowrap ${config.color}`}>
                            <Icon className="w-3 h-3" />
                            {config.label}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-bold text-moja-blue">{event.staffName}</p>
                              {event.adminName && (
                                <span className="text-xs text-moja-blue/40 font-medium">by {event.adminName}</span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{event.summary}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs font-semibold text-moja-blue/30 whitespace-nowrap">
                            {new Date(event.timestamp).toLocaleString('en-US', {
                              timeZone: TZ, hour: '2-digit', minute: '2-digit',
                            })}
                          </span>
                          {hasExpandable && (
                            isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                          )}
                        </div>
                      </div>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="mt-3 ml-[calc(0.75rem+theme(spacing.3))]">
                          {event.oldValues && event.category === 'clock_edit' && (
                            <div className="text-xs font-mono bg-gray-50 rounded-lg p-3 space-y-1">
                              <div className="text-red-500">
                                <span className="mr-1">-</span>
                                In: {event.oldValues.clock_in_time ? fmtShort(event.oldValues.clock_in_time as string) : '?'}
                                {event.oldValues.clock_out_time && <> | Out: {fmtShort(event.oldValues.clock_out_time as string)}</>}
                              </div>
                              {event.newValues && (
                                <div className="text-green-600">
                                  <span className="mr-1">+</span>
                                  {event.newValues.clock_in_time && <>In: {fmtShort(event.newValues.clock_in_time as string)}</>}
                                  {event.newValues.clock_out_time && <> | Out: {fmtShort(event.newValues.clock_out_time as string)}</>}
                                </div>
                              )}
                            </div>
                          )}
                          {event.detail && (
                            <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                              {event.detail}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {hasMore && (
            <div className="text-center pt-2">
              <button
                onClick={() => setVisibleCount(prev => prev + 50)}
                className="px-6 py-2.5 text-sm font-bold text-moja-blue bg-white border-2 border-gray-200 hover:border-moja-blue/30 rounded-xl transition-colors"
              >
                Load More ({filtered.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-2 h-2 rounded-full ${color}`} />
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-2xl font-bold text-moja-blue">{count}</p>
    </div>
  );
}

function actionLabel(action: string) {
  const map: Record<string, string> = {
    manual_edit: 'Clock times edited',
    manual_add: 'Shift added manually',
    manual_delete: 'Shift deleted',
    force_clock_out: 'Forced clock out',
  };
  return map[action] || action;
}

function buildCorrectionDetail(c: {
  original_clock_in?: string;
  original_clock_out?: string;
  proposed_clock_in?: string;
  proposed_clock_out?: string;
}) {
  const parts: string[] = [];
  if (c.original_clock_in) parts.push(`Original In: ${fmtDate(c.original_clock_in)}`);
  if (c.original_clock_out) parts.push(`Original Out: ${fmtDate(c.original_clock_out)}`);
  if (c.proposed_clock_in) parts.push(`Proposed In: ${fmtDate(c.proposed_clock_in)}`);
  if (c.proposed_clock_out) parts.push(`Proposed Out: ${fmtDate(c.proposed_clock_out)}`);
  return parts.length ? parts.join(' | ') : undefined;
}
