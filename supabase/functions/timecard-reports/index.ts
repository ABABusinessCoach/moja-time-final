import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toEST(date: Date): Date {
  const estStr = date.toLocaleString("en-US", { timeZone: "America/New_York" });
  return new Date(estStr);
}

function formatDateEST(date: Date): string {
  const est = toEST(date);
  const y = est.getFullYear();
  const m = String(est.getMonth() + 1).padStart(2, "0");
  const d = String(est.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getPayPeriodForDate(date: Date): { start: Date; end: Date } {
  const refDate = new Date("2026-06-27T00:00:00");
  const now = toEST(date);
  now.setHours(0, 0, 0, 0);

  const dayOfWeek = now.getDay();
  const daysSinceSat = dayOfWeek === 6 ? 0 : dayOfWeek + 1;
  const currentWeekSat = new Date(now);
  currentWeekSat.setDate(now.getDate() - daysSinceSat);

  const msSinceRef = currentWeekSat.getTime() - refDate.getTime();
  const weeksSinceRef = Math.round(msSinceRef / (7 * 24 * 60 * 60 * 1000));
  const isSecondWeek = weeksSinceRef % 2 !== 0;

  const payPeriodStart = new Date(currentWeekSat);
  if (isSecondWeek) {
    payPeriodStart.setDate(payPeriodStart.getDate() - 7);
  }
  const payPeriodEnd = new Date(payPeriodStart);
  payPeriodEnd.setDate(payPeriodStart.getDate() + 13);
  payPeriodEnd.setHours(23, 59, 59, 999);

  return { start: payPeriodStart, end: payPeriodEnd };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const url = new URL(req.url);
    const path = url.pathname.replace("/timecard-reports", "");

    // --- GENERATE REPORTS (scheduled trigger - Friday 3PM EST) ---
    if (req.method === "POST" && path === "/generate") {
      const { end_date_override } = await req.json().catch(() => ({}));

      let periodStart: string;
      let periodEnd: string;

      if (end_date_override) {
        const overrideDate = new Date(end_date_override + "T00:00:00");
        const pp = getPayPeriodForDate(overrideDate);
        periodStart = formatDateEST(pp.start);
        periodEnd = formatDateEST(pp.end);
      } else {
        const now = new Date();
        const pp = getPayPeriodForDate(now);
        periodStart = formatDateEST(pp.start);
        periodEnd = formatDateEST(pp.end);
      }

      // Create or get pay period
      const { data: existingPP } = await supabase
        .from("pay_periods")
        .select("id, status")
        .eq("start_date", periodStart)
        .eq("end_date", periodEnd)
        .maybeSingle();

      let payPeriodId: string;

      if (existingPP) {
        if (existingPP.status === "finalized") {
          return json({ success: false, message: "Pay period already finalized" }, 400);
        }
        payPeriodId = existingPP.id;
        await supabase.from("pay_periods").update({ status: "locked" }).eq("id", payPeriodId);
      } else {
        const { data: newPP, error: ppErr } = await supabase
          .from("pay_periods")
          .insert({ start_date: periodStart, end_date: periodEnd, status: "locked" })
          .select("id")
          .single();
        if (ppErr) return json({ success: false, message: ppErr.message }, 500);
        payPeriodId = newPP.id;
      }

      // Get all active staff
      const { data: allStaff } = await supabase
        .from("staff")
        .select("id, name, email")
        .eq("is_active", true);

      if (!allStaff || allStaff.length === 0) {
        return json({ success: true, message: "No active staff", reports_generated: 0 });
      }

      // Get overtime threshold from settings
      const { data: settings } = await supabase
        .from("app_settings")
        .select("key, value")
        .eq("key", "overtime_weekly_threshold")
        .maybeSingle();
      const overtimeThreshold = Number(settings?.value || 40);

      const appUrl = Deno.env.get("APP_URL") || "https://time.mojakids.com";
      const reports: Array<{ staff_name: string; email: string; report_id: string }> = [];

      for (const staff of allStaff) {
        // Check if report already exists
        const { data: existingReport } = await supabase
          .from("timecard_reports")
          .select("id")
          .eq("staff_id", staff.id)
          .eq("pay_period_id", payPeriodId)
          .maybeSingle();

        if (existingReport) continue;

        // Calculate total hours for this staff in the pay period
        const { data: logs } = await supabase
          .from("clock_logs")
          .select("duration_minutes, clock_in_time")
          .eq("staff_id", staff.id)
          .gte("clock_in_time", periodStart + "T00:00:00")
          .lte("clock_in_time", periodEnd + "T23:59:59");

        const totalMinutes = (logs || []).reduce(
          (sum: number, l: { duration_minutes: number | null }) => sum + (l.duration_minutes || 0), 0
        );
        const totalHours = Math.round((totalMinutes / 60) * 100) / 100;

        // Calculate weekly overtime
        const ppStartDate = new Date(periodStart + "T00:00:00");
        const week1EndDate = new Date(ppStartDate);
        week1EndDate.setDate(ppStartDate.getDate() + 6);
        const week1EndStr = formatDateEST(week1EndDate);

        const week1Minutes = (logs || []).filter(
          (l: { clock_in_time: string }) => l.clock_in_time <= week1EndStr + "T23:59:59"
        ).reduce((sum: number, l: { duration_minutes: number | null }) => sum + (l.duration_minutes || 0), 0);

        const week2Minutes = totalMinutes - week1Minutes;

        const week1OT = Math.max(0, (week1Minutes / 60) - overtimeThreshold);
        const week2OT = Math.max(0, (week2Minutes / 60) - overtimeThreshold);
        const overtimeHours = Math.round((week1OT + week2OT) * 100) / 100;

        const { data: report, error: reportErr } = await supabase
          .from("timecard_reports")
          .insert({
            staff_id: staff.id,
            pay_period_id: payPeriodId,
            total_hours: totalHours,
            overtime_hours: overtimeHours,
            status: "pending_review",
          })
          .select("id, access_token")
          .single();

        if (reportErr) continue;

        reports.push({ staff_name: staff.name, email: staff.email, report_id: report.id });

        // Send email via Supabase (Resend integration)
        const reportLink = `${appUrl}/#/timecard/${report.access_token}`;
        const otFlag = overtimeHours > 0 ? `\n\nOvertime: ${overtimeHours.toFixed(1)} hours` : "";

        try {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "Moja Time Clock <timeclock@mojakids.com>",
              to: [staff.email],
              subject: `Your Timecard Report - ${periodStart} to ${periodEnd}`,
              html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                  <div style="background: #355574; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
                    <h1 style="color: white; margin: 0; font-size: 22px;">Timecard Report</h1>
                    <p style="color: rgba(255,255,255,0.7); margin: 4px 0 0;">Pay period: ${periodStart} to ${periodEnd}</p>
                  </div>
                  <div style="background: #f8f9fa; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                    <p style="margin: 0 0 8px; font-size: 16px;">Hi ${staff.name.split(" ")[0]},</p>
                    <p style="margin: 0; color: #555; line-height: 1.5;">Your timecard for this pay period is ready for review.</p>
                  </div>
                  <div style="background: white; border: 2px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                    <p style="margin: 0 0 4px; font-size: 14px; color: #666;">Total Hours</p>
                    <p style="margin: 0; font-size: 28px; font-weight: bold; color: #355574;">${totalHours.toFixed(1)}h</p>
                    ${overtimeHours > 0 ? `<p style="margin: 8px 0 0; font-size: 14px; color: #e66d38; font-weight: 600;">Overtime: ${overtimeHours.toFixed(1)}h</p>` : ""}
                  </div>
                  <a href="${reportLink}" style="display: block; background: #e66d38; color: white; text-align: center; padding: 16px; border-radius: 10px; text-decoration: none; font-weight: bold; font-size: 16px; margin-bottom: 20px;">Review Your Timecard</a>
                  <div style="background: #fff8f0; border: 1px solid #fde0c8; border-radius: 10px; padding: 16px; margin-bottom: 20px;">
                    <p style="margin: 0 0 8px; font-weight: 600; color: #c2410c; font-size: 14px;">Review Deadline</p>
                    <p style="margin: 0; color: #555; font-size: 14px; line-height: 1.5;">Please review and add any notes by <strong>8:00 PM EST today</strong>.</p>
                    <p style="margin: 8px 0 0; color: #888; font-size: 13px;">After 8:00 PM EST, this report will be considered final unless a note is added.</p>
                  </div>
                  <p style="color: #999; font-size: 12px; text-align: center;">Moja Behavioral Services Time Clock</p>
                </div>
              `,
            }),
          });
        } catch (_emailErr) {
          // Email send failure shouldn't block report generation
        }
      }

      return json({
        success: true,
        pay_period_id: payPeriodId,
        period: { start: periodStart, end: periodEnd },
        reports_generated: reports.length,
        reports,
      });
    }

    // --- AUTO-APPROVE (scheduled trigger - Friday 8PM EST) ---
    if (req.method === "POST" && path === "/auto-approve") {
      const { data: pendingReports } = await supabase
        .from("timecard_reports")
        .select("id")
        .eq("status", "pending_review");

      if (!pendingReports || pendingReports.length === 0) {
        return json({ success: true, message: "No reports to auto-approve", approved_count: 0 });
      }

      const ids = pendingReports.map((r: { id: string }) => r.id);
      const { error } = await supabase
        .from("timecard_reports")
        .update({ status: "approved", approved_at: new Date().toISOString() })
        .in("id", ids);

      if (error) return json({ success: false, message: error.message }, 500);

      return json({ success: true, approved_count: ids.length });
    }

    // --- GET REPORT BY TOKEN (employee access) ---
    if (req.method === "GET" && path.startsWith("/by-token/")) {
      const token = path.replace("/by-token/", "");
      if (!token) return json({ success: false, message: "Token required" }, 400);

      const { data: report } = await supabase
        .from("timecard_reports")
        .select("id, staff_id, pay_period_id, total_hours, overtime_hours, status, generated_at, approved_at")
        .eq("access_token", token)
        .maybeSingle();

      if (!report) return json({ success: false, message: "Report not found" }, 404);

      const { data: staff } = await supabase
        .from("staff")
        .select("name, email")
        .eq("id", report.staff_id)
        .maybeSingle();

      const { data: payPeriod } = await supabase
        .from("pay_periods")
        .select("start_date, end_date, status")
        .eq("id", report.pay_period_id)
        .maybeSingle();

      // Get shift logs for this period
      const { data: shifts } = await supabase
        .from("clock_logs")
        .select("id, clock_in_time, clock_out_time, duration_minutes, notes")
        .eq("staff_id", report.staff_id)
        .gte("clock_in_time", payPeriod!.start_date + "T00:00:00")
        .lte("clock_in_time", payPeriod!.end_date + "T23:59:59")
        .order("clock_in_time");

      // Get break logs
      const { data: breaks } = await supabase
        .from("break_logs")
        .select("clock_log_id, break_start, break_end, duration_minutes, break_type")
        .eq("staff_id", report.staff_id)
        .gte("break_start", payPeriod!.start_date + "T00:00:00")
        .lte("break_start", payPeriod!.end_date + "T23:59:59");

      // Get notes for this report
      const { data: notes } = await supabase
        .from("shift_notes")
        .select("id, clock_log_id, author_type, body, status, resolution_comment, created_at, resolved_at")
        .eq("timecard_report_id", report.id)
        .order("created_at");

      return json({
        success: true,
        report: {
          ...report,
          staff_name: staff?.name,
          staff_email: staff?.email,
          pay_period: payPeriod,
        },
        shifts: shifts || [],
        breaks: breaks || [],
        notes: notes || [],
      });
    }

    // --- ADD NOTE (employee) ---
    if (req.method === "POST" && path === "/notes") {
      const { access_token, clock_log_id, body } = await req.json();

      if (!access_token || !body?.trim()) {
        return json({ success: false, message: "Token and note body required" }, 400);
      }

      const { data: report } = await supabase
        .from("timecard_reports")
        .select("id, staff_id, status")
        .eq("access_token", access_token)
        .maybeSingle();

      if (!report) return json({ success: false, message: "Report not found" }, 404);
      if (report.status === "approved") {
        return json({ success: false, message: "This report has been approved and can no longer be edited" }, 403);
      }

      const { data: note, error } = await supabase
        .from("shift_notes")
        .insert({
          timecard_report_id: report.id,
          clock_log_id: clock_log_id || null,
          author_type: "employee",
          author_id: report.staff_id,
          body: body.trim(),
          status: "open",
        })
        .select("id, clock_log_id, body, status, created_at")
        .single();

      if (error) return json({ success: false, message: error.message }, 500);

      // Update report status to has_notes
      await supabase
        .from("timecard_reports")
        .update({ status: "has_notes" })
        .eq("id", report.id);

      return json({ success: true, note });
    }

    // --- UPDATE NOTE (employee) ---
    if (req.method === "PUT" && path === "/notes") {
      const { access_token, note_id, body } = await req.json();

      if (!access_token || !note_id || !body?.trim()) {
        return json({ success: false, message: "Token, note_id, and body required" }, 400);
      }

      const { data: report } = await supabase
        .from("timecard_reports")
        .select("id, staff_id, status")
        .eq("access_token", access_token)
        .maybeSingle();

      if (!report) return json({ success: false, message: "Report not found" }, 404);
      if (report.status === "approved") {
        return json({ success: false, message: "Report is approved" }, 403);
      }

      const { data: note } = await supabase
        .from("shift_notes")
        .select("id, author_id, status")
        .eq("id", note_id)
        .eq("timecard_report_id", report.id)
        .maybeSingle();

      if (!note) return json({ success: false, message: "Note not found" }, 404);
      if (note.author_id !== report.staff_id) {
        return json({ success: false, message: "Not authorized" }, 403);
      }
      if (note.status !== "open") {
        return json({ success: false, message: "Note already resolved" }, 403);
      }

      const { error } = await supabase
        .from("shift_notes")
        .update({ body: body.trim() })
        .eq("id", note_id);

      if (error) return json({ success: false, message: error.message }, 500);
      return json({ success: true });
    }

    // --- DELETE NOTE (employee) ---
    if (req.method === "DELETE" && path === "/notes") {
      const { access_token, note_id } = await req.json();

      if (!access_token || !note_id) {
        return json({ success: false, message: "Token and note_id required" }, 400);
      }

      const { data: report } = await supabase
        .from("timecard_reports")
        .select("id, staff_id, status")
        .eq("access_token", access_token)
        .maybeSingle();

      if (!report) return json({ success: false, message: "Report not found" }, 404);
      if (report.status === "approved") {
        return json({ success: false, message: "Report is approved" }, 403);
      }

      const { data: note } = await supabase
        .from("shift_notes")
        .select("id, author_id, status")
        .eq("id", note_id)
        .eq("timecard_report_id", report.id)
        .maybeSingle();

      if (!note) return json({ success: false, message: "Note not found" }, 404);
      if (note.author_id !== report.staff_id) {
        return json({ success: false, message: "Not authorized" }, 403);
      }
      if (note.status !== "open") {
        return json({ success: false, message: "Note already resolved" }, 403);
      }

      await supabase.from("shift_notes").delete().eq("id", note_id);

      // Check if there are remaining notes
      const { data: remainingNotes } = await supabase
        .from("shift_notes")
        .select("id")
        .eq("timecard_report_id", report.id);

      if (!remainingNotes || remainingNotes.length === 0) {
        await supabase
          .from("timecard_reports")
          .update({ status: "pending_review" })
          .eq("id", report.id);
      }

      return json({ success: true });
    }

    // --- EMPLOYEE SELF-APPROVE ---
    if (req.method === "POST" && path === "/approve") {
      const { access_token } = await req.json();
      if (!access_token) {
        return json({ success: false, message: "Token required" }, 400);
      }

      const { data: report } = await supabase
        .from("timecard_reports")
        .select("id, status")
        .eq("access_token", access_token)
        .maybeSingle();

      if (!report) return json({ success: false, message: "Report not found" }, 404);
      if (report.status === "approved") {
        return json({ success: true, message: "Already approved" });
      }
      if (report.status === "has_notes") {
        return json({ success: false, message: "Cannot approve while notes are pending" }, 400);
      }

      const { error } = await supabase
        .from("timecard_reports")
        .update({ status: "approved", approved_at: new Date().toISOString() })
        .eq("id", report.id);

      if (error) return json({ success: false, message: error.message }, 500);
      return json({ success: true });
    }

    // --- RESOLVE NOTE (manager, requires auth) ---
    if (req.method === "POST" && path === "/resolve-note") {
      const authHeader = req.headers.get("Authorization")?.replace("Bearer ", "");
      if (!authHeader) return json({ success: false, message: "Unauthorized" }, 401);

      const { data: { user } } = await createClient(supabaseUrl, authHeader).auth.getUser();
      if (!user) return json({ success: false, message: "Unauthorized" }, 401);

      // Verify admin
      const { data: admin } = await supabase
        .from("admins")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();
      if (!admin) return json({ success: false, message: "Not an admin" }, 403);

      const { note_id, resolution_comment, action } = await req.json();
      if (!note_id || !action) {
        return json({ success: false, message: "note_id and action required" }, 400);
      }

      const newStatus = action === "dismiss" ? "resolved" : "resolved";

      const { error } = await supabase
        .from("shift_notes")
        .update({
          status: newStatus,
          resolution_comment: resolution_comment?.trim() || (action === "dismiss" ? "Dismissed by manager" : null),
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
        })
        .eq("id", note_id);

      if (error) return json({ success: false, message: error.message }, 500);

      // Get the report for this note
      const { data: noteData } = await supabase
        .from("shift_notes")
        .select("timecard_report_id")
        .eq("id", note_id)
        .maybeSingle();

      if (noteData) {
        // Check if all notes on this report are resolved
        const { data: openNotes } = await supabase
          .from("shift_notes")
          .select("id")
          .eq("timecard_report_id", noteData.timecard_report_id)
          .neq("status", "resolved");

        if (!openNotes || openNotes.length === 0) {
          await supabase
            .from("timecard_reports")
            .update({ status: "approved", approved_at: new Date().toISOString() })
            .eq("id", noteData.timecard_report_id);
        }
      }

      return json({ success: true });
    }

    // --- LIST REPORTS WITH NOTES (manager view) ---
    if (req.method === "GET" && path === "/pending-review") {
      const authHeader = req.headers.get("Authorization")?.replace("Bearer ", "");
      if (!authHeader) return json({ success: false, message: "Unauthorized" }, 401);

      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const { data: { user } } = await createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${authHeader}` } }
      }).auth.getUser();
      if (!user) return json({ success: false, message: "Unauthorized" }, 401);

      const { data: admin } = await supabase
        .from("admins")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();
      if (!admin) return json({ success: false, message: "Not an admin" }, 403);

      const { data: reports } = await supabase
        .from("timecard_reports")
        .select(`
          id, staff_id, pay_period_id, total_hours, overtime_hours, status, generated_at,
          pay_periods (start_date, end_date),
          staff (name, email)
        `)
        .eq("status", "has_notes")
        .order("generated_at", { ascending: false });

      // Enrich each report with live shift data and notes
      const reportsWithLiveData = [];
      for (const report of (reports || [])) {
        const pp = report.pay_periods as { start_date: string; end_date: string } | null;
        const { data: notes } = await supabase
          .from("shift_notes")
          .select("id, clock_log_id, author_type, body, status, resolution_comment, created_at, resolved_at")
          .eq("timecard_report_id", report.id)
          .order("created_at");

        let shift_count = 0;
        let has_open_shift = false;
        let live_total_minutes = 0;
        let live_break_minutes = 0;

        if (pp) {
          const { data: shifts } = await supabase
            .from("clock_logs")
            .select("id, clock_out_time, duration_minutes")
            .eq("staff_id", report.staff_id)
            .gte("clock_in_time", pp.start_date + "T00:00:00")
            .lte("clock_in_time", pp.end_date + "T23:59:59");

          shift_count = shifts?.length || 0;
          has_open_shift = (shifts || []).some((s: { clock_out_time: string | null }) => !s.clock_out_time);
          live_total_minutes = (shifts || []).reduce((sum: number, s: { duration_minutes: number | null }) => sum + (s.duration_minutes || 0), 0);

          const { data: breaks } = await supabase
            .from("break_logs")
            .select("duration_minutes")
            .eq("staff_id", report.staff_id)
            .gte("break_start", pp.start_date + "T00:00:00")
            .lte("break_start", pp.end_date + "T23:59:59");

          live_break_minutes = (breaks || []).reduce((sum: number, b: { duration_minutes: number | null }) => sum + (b.duration_minutes || 0), 0);
        }

        reportsWithLiveData.push({
          ...report,
          notes: notes || [],
          shift_count,
          has_open_shift,
          live_total_hours: Math.round(((live_total_minutes - live_break_minutes) / 60) * 100) / 100,
        });
      }

      return json({ success: true, reports: reportsWithLiveData });
    }

    // --- LIST ALL REPORTS (manager, paginated) ---
    if (req.method === "GET" && path === "/all") {
      const authHeader = req.headers.get("Authorization")?.replace("Bearer ", "");
      if (!authHeader) return json({ success: false, message: "Unauthorized" }, 401);

      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const { data: { user } } = await createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${authHeader}` } }
      }).auth.getUser();
      if (!user) return json({ success: false, message: "Unauthorized" }, 401);

      const { data: admin } = await supabase
        .from("admins")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();
      if (!admin) return json({ success: false, message: "Not an admin" }, 403);

      const { data: reports } = await supabase
        .from("timecard_reports")
        .select(`
          id, staff_id, pay_period_id, total_hours, overtime_hours, status, generated_at, approved_at,
          pay_periods (start_date, end_date, status),
          staff (name, email)
        `)
        .order("generated_at", { ascending: false })
        .limit(100);

      // Enrich with live shift data
      const enriched = [];
      for (const report of (reports || [])) {
        const pp = report.pay_periods as { start_date: string; end_date: string; status: string } | null;
        let shift_count = 0;
        let has_open_shift = false;
        let live_total_minutes = 0;
        let live_break_minutes = 0;

        if (pp) {
          const { data: shifts } = await supabase
            .from("clock_logs")
            .select("id, clock_out_time, duration_minutes")
            .eq("staff_id", report.staff_id)
            .gte("clock_in_time", pp.start_date + "T00:00:00")
            .lte("clock_in_time", pp.end_date + "T23:59:59");

          shift_count = shifts?.length || 0;
          has_open_shift = (shifts || []).some((s: { clock_out_time: string | null }) => !s.clock_out_time);
          live_total_minutes = (shifts || []).reduce((sum: number, s: { duration_minutes: number | null }) => sum + (s.duration_minutes || 0), 0);

          const { data: breaks } = await supabase
            .from("break_logs")
            .select("duration_minutes")
            .eq("staff_id", report.staff_id)
            .gte("break_start", pp.start_date + "T00:00:00")
            .lte("break_start", pp.end_date + "T23:59:59");

          live_break_minutes = (breaks || []).reduce((sum: number, b: { duration_minutes: number | null }) => sum + (b.duration_minutes || 0), 0);
        }

        enriched.push({
          ...report,
          shift_count,
          has_open_shift,
          live_total_hours: Math.round(((live_total_minutes - live_break_minutes) / 60) * 100) / 100,
        });
      }

      return json({ success: true, reports: enriched });
    }

    // --- GET SHIFT DETAILS FOR A REPORT (manager) ---
    if (req.method === "GET" && path.startsWith("/detail/")) {
      const reportId = path.replace("/detail/", "");
      const authHeader = req.headers.get("Authorization")?.replace("Bearer ", "");
      if (!authHeader) return json({ success: false, message: "Unauthorized" }, 401);

      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const { data: { user } } = await createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${authHeader}` } }
      }).auth.getUser();
      if (!user) return json({ success: false, message: "Unauthorized" }, 401);

      const { data: admin } = await supabase
        .from("admins")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();
      if (!admin) return json({ success: false, message: "Not an admin" }, 403);

      const { data: report } = await supabase
        .from("timecard_reports")
        .select("id, staff_id, pay_period_id, total_hours, overtime_hours, status, generated_at, approved_at")
        .eq("id", reportId)
        .maybeSingle();

      if (!report) return json({ success: false, message: "Report not found" }, 404);

      const { data: staff } = await supabase
        .from("staff")
        .select("name, email")
        .eq("id", report.staff_id)
        .maybeSingle();

      const { data: payPeriod } = await supabase
        .from("pay_periods")
        .select("start_date, end_date, status")
        .eq("id", report.pay_period_id)
        .maybeSingle();

      const { data: shifts } = await supabase
        .from("clock_logs")
        .select("id, clock_in_time, clock_out_time, duration_minutes, notes")
        .eq("staff_id", report.staff_id)
        .gte("clock_in_time", payPeriod!.start_date + "T00:00:00")
        .lte("clock_in_time", payPeriod!.end_date + "T23:59:59")
        .order("clock_in_time");

      const { data: breaks } = await supabase
        .from("break_logs")
        .select("clock_log_id, break_start, break_end, duration_minutes, break_type")
        .eq("staff_id", report.staff_id)
        .gte("break_start", payPeriod!.start_date + "T00:00:00")
        .lte("break_start", payPeriod!.end_date + "T23:59:59");

      const { data: notes } = await supabase
        .from("shift_notes")
        .select("id, clock_log_id, author_type, author_id, body, status, resolution_comment, created_at, resolved_at, resolved_by")
        .eq("timecard_report_id", report.id)
        .order("created_at");

      return json({
        success: true,
        report: { ...report, staff_name: staff?.name, staff_email: staff?.email, pay_period: payPeriod },
        shifts: shifts || [],
        breaks: breaks || [],
        notes: notes || [],
      });
    }

    // --- VERIFY PIN FOR TIMECARD ACCESS (employee) ---
    if (req.method === "POST" && path === "/verify-pin") {
      const { access_token, pin } = await req.json();

      if (!access_token) {
        return json({ success: false, message: "Token required" }, 400);
      }
      if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        return json({ success: false, message: "PIN must be exactly 4 digits" }, 400);
      }

      const { data: report } = await supabase
        .from("timecard_reports")
        .select("id, staff_id")
        .eq("access_token", access_token)
        .maybeSingle();

      if (!report) {
        return json({ success: false, message: "Report not found" }, 404);
      }

      const { data: staff } = await supabase
        .from("staff")
        .select("id, name, pin_hash, is_active")
        .eq("id", report.staff_id)
        .maybeSingle();

      if (!staff || !staff.is_active) {
        return json({ success: false, message: "Staff not found" }, 404);
      }

      const valid = await bcrypt.compare(pin, staff.pin_hash);
      if (!valid) {
        return json({ success: false, message: "Invalid PIN" }, 401);
      }

      return json({ success: true, staff_name: staff.name });
    }

    return json({ success: false, message: "Not found" }, 404);
  } catch (err) {
    return json({ success: false, message: (err as Error).message }, 500);
  }
});
