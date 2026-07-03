import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import bcrypt from "npm:bcryptjs@2.4.3";

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

function getPayPeriodForDate(date: Date): { start: string; end: string } {
  // Reference: Saturday June 27 2026 is a known period start
  const refDate = new Date("2026-06-27T00:00:00");
  const now = toEST(date);
  now.setHours(0, 0, 0, 0);

  const dayOfWeek = now.getDay();
  // daysSinceSat: Saturday=0, Sunday=1, Mon=2, ... Fri=6
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

  // Format directly from the already-EST-adjusted dates (no double conversion)
  const fmtDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  return { start: fmtDate(payPeriodStart), end: fmtDate(payPeriodEnd) };
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

    // --- SEND TEST (single staff member only) ---
    if (req.method === "POST" && path === "/send-test") {
      const { email } = await req.json().catch(() => ({}));
      if (!email) return json({ success: false, message: "email is required" }, 400);

      const { data: staff } = await supabase
        .from("staff")
        .select("id, name, email")
        .eq("email", email)
        .eq("is_active", true)
        .maybeSingle();

      if (!staff) return json({ success: false, message: `No active staff found with email: ${email}` }, 404);

      // Calculate current pay period
      const now = new Date();
      const pp = getPayPeriodForDate(now);
      const periodStart = pp.start;
      const periodEnd = pp.end;

      // Get or create pay period
      let payPeriodId: string;
      const { data: existingPP } = await supabase
        .from("pay_periods")
        .select("id, status")
        .eq("start_date", periodStart)
        .eq("end_date", periodEnd)
        .maybeSingle();

      if (existingPP) {
        payPeriodId = existingPP.id;
      } else {
        const { data: newPP, error: ppErr } = await supabase
          .from("pay_periods")
          .insert({ start_date: periodStart, end_date: periodEnd, status: "locked" })
          .select("id")
          .single();
        if (ppErr) return json({ success: false, message: ppErr.message }, 500);
        payPeriodId = newPP.id;
      }

      // Delete existing report for this staff + period (so we can regenerate)
      await supabase
        .from("shift_notes")
        .delete()
        .in("timecard_report_id", (
          await supabase
            .from("timecard_reports")
            .select("id")
            .eq("staff_id", staff.id)
            .eq("pay_period_id", payPeriodId)
        ).data?.map((r: { id: string }) => r.id) || []);

      await supabase
        .from("timecard_reports")
        .delete()
        .eq("staff_id", staff.id)
        .eq("pay_period_id", payPeriodId);

      // Calculate hours
      const { data: logs } = await supabase
        .from("clock_logs")
        .select("duration_minutes, clock_in_time")
        .eq("staff_id", staff.id)
        .gte("clock_in_time", periodStart + "T00:00:00")
        .lte("clock_in_time", periodEnd + "T23:59:59");

      const grossMinutes = (logs || []).reduce(
        (sum: number, l: { duration_minutes: number | null }) => sum + (l.duration_minutes || 0), 0
      );

      // Deduct only lunch (unpaid); paid breaks are NOT deducted
      const { data: lunchBreaks } = await supabase
        .from("break_logs")
        .select("duration_minutes, break_start")
        .eq("staff_id", staff.id)
        .eq("break_type", "lunch")
        .gte("break_start", periodStart + "T00:00:00")
        .lte("break_start", periodEnd + "T23:59:59");

      const lunchMinutes = (lunchBreaks || []).reduce(
        (sum: number, b: { duration_minutes: number | null }) => sum + (b.duration_minutes || 0), 0
      );

      const totalMinutes = grossMinutes - lunchMinutes;
      const totalHours = Math.round((totalMinutes / 60) * 100) / 100;

      // Overtime
      const { data: settings } = await supabase
        .from("app_settings")
        .select("key, value")
        .eq("key", "overtime_weekly_threshold")
        .maybeSingle();
      const overtimeThreshold = Number(settings?.value || 40);

      const ppStartDate = new Date(periodStart + "T00:00:00");
      const week1EndDate = new Date(ppStartDate);
      week1EndDate.setDate(ppStartDate.getDate() + 6);
      const week1EndStr = formatDateEST(week1EndDate);

      const week1GrossMin = (logs || []).filter(
        (l: { clock_in_time: string }) => l.clock_in_time <= week1EndStr + "T23:59:59"
      ).reduce((sum: number, l: { duration_minutes: number | null }) => sum + (l.duration_minutes || 0), 0);

      const week1LunchMin = (lunchBreaks || []).filter(
        (b: { break_start: string }) => b.break_start <= week1EndStr + "T23:59:59"
      ).reduce((sum: number, b: { duration_minutes: number | null }) => sum + (b.duration_minutes || 0), 0);

      const week1Minutes = week1GrossMin - week1LunchMin;
      const week2Minutes = totalMinutes - week1Minutes;

      const week1OT = Math.max(0, (week1Minutes / 60) - overtimeThreshold);
      const week2OT = Math.max(0, (week2Minutes / 60) - overtimeThreshold);
      const overtimeHours = Math.round((week1OT + week2OT) * 100) / 100;

      // Create report
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

      if (reportErr) return json({ success: false, message: reportErr.message }, 500);

      // Build full timecard snapshot for the email
      const { data: shifts } = await supabase
        .from("clock_logs")
        .select("id, clock_in_time, clock_out_time, duration_minutes")
        .eq("staff_id", staff.id)
        .gte("clock_in_time", periodStart + "T00:00:00")
        .lte("clock_in_time", periodEnd + "T23:59:59")
        .order("clock_in_time");

      const { data: breaks } = await supabase
        .from("break_logs")
        .select("clock_log_id, break_start, break_end, duration_minutes, break_type")
        .eq("staff_id", staff.id)
        .gte("break_start", periodStart + "T00:00:00")
        .lte("break_start", periodEnd + "T23:59:59");

      const DAY_NAMES = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];
      const ppStartDate2 = new Date(periodStart + "T00:00:00");

      function fmtTime(iso: string): string {
        return new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
      }
      function getDateKey(iso: string): string {
        return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
      }
      function fmtDec(mins: number): string {
        return mins > 0 ? (mins / 60).toFixed(2) : "";
      }

      let tableRows = "";
      let grandTotal = 0;

      for (let w = 0; w < 2; w++) {
        const weekStart = new Date(ppStartDate2);
        weekStart.setDate(ppStartDate2.getDate() + w * 7);
        const wLabel = `Week ${w + 1}`;
        tableRows += `<tr><td colspan="6" style="background:#f1f5f9;padding:8px 12px;font-weight:700;font-size:12px;color:#475569;border-bottom:1px solid #e2e8f0;">${wLabel}</td></tr>`;

        let weekTotal = 0;
        for (let d = 0; d < 7; d++) {
          const curDate = new Date(weekStart);
          curDate.setDate(weekStart.getDate() + d);
          const dateKey = `${curDate.getFullYear()}-${String(curDate.getMonth() + 1).padStart(2, "0")}-${String(curDate.getDate()).padStart(2, "0")}`;

          const dayShifts = (shifts || []).filter((s: { clock_in_time: string }) => getDateKey(s.clock_in_time) === dateKey);
          const shift = dayShifts.length > 0 ? dayShifts[0] : null;

          let startTime = "";
          let endTime = "";
          let lunchOut = "";
          let lunchIn = "";
          let netMins = 0;

          if (shift) {
            startTime = fmtTime(shift.clock_in_time);
            endTime = shift.clock_out_time ? fmtTime(shift.clock_out_time) : "open";
            const shiftBreaks = (breaks || []).filter((b: { clock_log_id: string }) => b.clock_log_id === shift.id);
            const lunchMin = shiftBreaks.filter((b: { break_type: string }) => b.break_type === "lunch").reduce((sum: number, b: { duration_minutes: number | null }) => sum + (b.duration_minutes || 0), 0);
            netMins = Math.max(0, (shift.duration_minutes || 0) - lunchMin);
            const lunch = shiftBreaks.find((b: { break_type: string }) => b.break_type === "lunch");
            if (lunch) {
              lunchOut = fmtTime(lunch.break_start);
              lunchIn = lunch.break_end ? fmtTime(lunch.break_end) : "";
            }
          }

          weekTotal += netMins;
          const bgColor = d < 2 ? "#fafafa" : "#ffffff";
          tableRows += `<tr style="background:${bgColor};border-bottom:1px solid #f1f5f9;">
            <td style="padding:6px 12px;font-weight:600;font-size:13px;color:#374151;">${DAY_NAMES[d]}</td>
            <td style="padding:6px 8px;font-size:13px;color:#4b5563;">${startTime}</td>
            <td style="padding:6px 8px;font-size:12px;color:#6b7280;">${lunchOut}</td>
            <td style="padding:6px 8px;font-size:12px;color:#6b7280;">${lunchIn}</td>
            <td style="padding:6px 8px;font-size:13px;color:#4b5563;">${endTime}</td>
            <td style="padding:6px 8px;font-size:13px;color:#374151;font-weight:600;text-align:right;">${fmtDec(netMins)}</td>
          </tr>`;
        }
        grandTotal += weekTotal;
        tableRows += `<tr style="background:#f1f5f9;border-bottom:2px solid #e2e8f0;">
          <td colspan="5" style="padding:6px 12px;font-weight:700;font-size:12px;color:#475569;">${wLabel} Subtotal</td>
          <td style="padding:6px 8px;font-size:13px;font-weight:700;color:#1e40af;text-align:right;">${fmtDec(weekTotal)}</td>
        </tr>`;
      }

      tableRows += `<tr style="background:#e2e8f0;">
        <td colspan="5" style="padding:8px 12px;font-weight:700;font-size:13px;color:#1e293b;">Period Total</td>
        <td style="padding:8px 8px;font-size:14px;font-weight:700;color:#1e40af;text-align:right;">${totalHours.toFixed(2)}</td>
      </tr>`;

      const timecardTable = `
        <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:20px;">
          <thead>
            <tr style="background:#355574;">
              <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:white;">Day</th>
              <th style="padding:10px 8px;text-align:left;font-size:12px;font-weight:600;color:white;">Start</th>
              <th style="padding:10px 8px;text-align:left;font-size:11px;font-weight:600;color:rgba(255,255,255,0.8);">Lunch Out</th>
              <th style="padding:10px 8px;text-align:left;font-size:11px;font-weight:600;color:rgba(255,255,255,0.8);">Lunch In</th>
              <th style="padding:10px 8px;text-align:left;font-size:12px;font-weight:600;color:white;">End</th>
              <th style="padding:10px 8px;text-align:right;font-size:12px;font-weight:600;color:white;">Hours</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>`;

      // Send email with full snapshot
      const appUrl = Deno.env.get("APP_URL") || "https://time.mojakids.com";
      const reportLink = `${appUrl}/#/timecard/${report.access_token}`;
      let emailSent = false;

      try {
        const resendKey = Deno.env.get("RESEND_API_KEY");
        if (resendKey) {
          const emailRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${resendKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "Moja Time Clock <timeclock@mojakids.com>",
              to: [staff.email],
              subject: `Your Timecard Report - ${periodStart} to ${periodEnd}`,
              html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 640px; margin: 0 auto; padding: 20px;">
                  <div style="background: #355574; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
                    <h1 style="color: white; margin: 0; font-size: 22px;">Timecard Report</h1>
                    <p style="color: rgba(255,255,255,0.7); margin: 4px 0 0;">Pay period: ${periodStart} to ${periodEnd}</p>
                  </div>
                  <div style="background: #f8f9fa; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                    <p style="margin: 0 0 8px; font-size: 16px;">Hi ${staff.name.split(" ")[0]},</p>
                    <p style="margin: 0; color: #555; line-height: 1.5;">Your timecard for this pay period is ready for review. Here's a summary of your hours:</p>
                  </div>
                  <div style="background: white; border: 2px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 20px; text-align: center;">
                    <p style="margin: 0 0 4px; font-size: 14px; color: #666;">Total Hours</p>
                    <p style="margin: 0; font-size: 32px; font-weight: bold; color: #355574;">${totalHours.toFixed(1)}h</p>
                    ${overtimeHours > 0 ? `<p style="margin: 8px 0 0; font-size: 14px; color: #e66d38; font-weight: 600;">Overtime: ${overtimeHours.toFixed(1)}h</p>` : ""}
                  </div>
                  <h2 style="font-size: 15px; color: #374151; margin: 0 0 12px; font-weight: 700;">Shift Details</h2>
                  ${timecardTable}
                  <div style="background: #fff8f0; border: 1px solid #fde0c8; border-radius: 10px; padding: 16px; margin-bottom: 20px;">
                    <p style="margin: 0 0 8px; font-weight: 600; color: #c2410c; font-size: 14px;">Please Review</p>
                    <p style="margin: 0; color: #555; font-size: 14px; line-height: 1.5;">If anything looks incorrect, click below to add a note before your manager finalizes your hours.</p>
                  </div>
                  <a href="${reportLink}" style="display: block; background: #e66d38; color: white; text-align: center; padding: 16px; border-radius: 10px; text-decoration: none; font-weight: bold; font-size: 16px; margin-bottom: 20px;">Add Notes or Questions</a>
                  <p style="color: #999; font-size: 12px; text-align: center;">Moja Behavioral Services Time Clock</p>
                </div>
              `,
            }),
          });
          emailSent = emailRes.ok;
        }
      } catch (_emailErr) {
        // Silent fail
      }

      return json({
        success: true,
        message: `Test report generated for ${staff.name} (${staff.email})`,
        email_sent: emailSent,
        report_link: reportLink,
        total_hours: totalHours,
        overtime_hours: overtimeHours,
        period: { start: periodStart, end: periodEnd },
      });
    }

    // --- CRON-TRIGGERED GENERATE (validates today is a cutoff Friday) ---
    if (req.method === "POST" && path === "/cron-generate") {
      const now = new Date();
      const pp = getPayPeriodForDate(now);
      const todayEST = formatDateEST(now);
      if (todayEST !== pp.end) {
        return json({ success: true, skipped: true, message: `Not a cutoff day. Today: ${todayEST}, period ends: ${pp.end}` });
      }
      // Redirect to the generate logic below with no override
      const generateUrl = new URL(req.url);
      generateUrl.pathname = generateUrl.pathname.replace("/cron-generate", "/generate");
      const internalReq = new Request(generateUrl.toString(), {
        method: "POST",
        headers: req.headers,
        body: JSON.stringify({}),
      });
      // Fall through to generate handler by reassigning path
    }

    // --- GENERATE REPORTS (manual or cron-forwarded) ---
    if (req.method === "POST" && (path === "/generate" || path === "/cron-generate")) {
      const { end_date_override } = await req.json().catch(() => ({}));

      let periodStart: string;
      let periodEnd: string;

      if (end_date_override) {
        const overrideDate = new Date(end_date_override + "T00:00:00");
        const pp = getPayPeriodForDate(overrideDate);
        periodStart = pp.start;
        periodEnd = pp.end;
      } else {
        const now = new Date();
        const pp = getPayPeriodForDate(now);
        periodStart = pp.start;
        periodEnd = pp.end;
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

        const grossMinutes = (logs || []).reduce(
          (sum: number, l: { duration_minutes: number | null }) => sum + (l.duration_minutes || 0), 0
        );

        // Deduct only lunch (unpaid); paid breaks are NOT deducted
        const { data: staffLunches } = await supabase
          .from("break_logs")
          .select("duration_minutes, break_start")
          .eq("staff_id", staff.id)
          .eq("break_type", "lunch")
          .gte("break_start", periodStart + "T00:00:00")
          .lte("break_start", periodEnd + "T23:59:59");

        const totalLunchMinutes = (staffLunches || []).reduce(
          (sum: number, b: { duration_minutes: number | null }) => sum + (b.duration_minutes || 0), 0
        );

        const totalMinutes = grossMinutes - totalLunchMinutes;
        const totalHours = Math.round((totalMinutes / 60) * 100) / 100;

        // Calculate weekly overtime
        const ppStartDate = new Date(periodStart + "T00:00:00");
        const week1EndDate = new Date(ppStartDate);
        week1EndDate.setDate(ppStartDate.getDate() + 6);
        const week1EndStr = formatDateEST(week1EndDate);

        const week1GrossMinutes = (logs || []).filter(
          (l: { clock_in_time: string }) => l.clock_in_time <= week1EndStr + "T23:59:59"
        ).reduce((sum: number, l: { duration_minutes: number | null }) => sum + (l.duration_minutes || 0), 0);

        const week1LunchMinutes = (staffLunches || []).filter(
          (b: { break_start: string }) => b.break_start <= week1EndStr + "T23:59:59"
        ).reduce((sum: number, b: { duration_minutes: number | null }) => sum + (b.duration_minutes || 0), 0);

        const week1Minutes = week1GrossMinutes - week1LunchMinutes;
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
        .update({ status: "employee_approved", approved_at: new Date().toISOString() })
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
        .select("id, staff_id, pay_period_id, total_hours, overtime_hours, status, generated_at, approved_at, admin_approved_at, admin_approved_by")
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

      // Get corrections for this report
      const { data: corrections } = await supabase
        .from("timecard_corrections")
        .select("id, clock_log_id, original_clock_in, original_clock_out, proposed_clock_in, proposed_clock_out, proposed_duration_minutes, proposed_hours, approval_status, rejection_reason, note, created_at")
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
        corrections: corrections || [],
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
      if (report.status === "approved" || report.status === "employee_approved") {
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
      if (report.status === "approved" || report.status === "employee_approved") {
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
      if (report.status === "approved" || report.status === "employee_approved") {
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
    // --- SAVE CORRECTION (employee proposes time edit per shift) ---
    if (req.method === "POST" && path === "/corrections") {
      const { access_token, clock_log_id, proposed_clock_in, proposed_clock_out, proposed_hours, note } = await req.json();
      if (!access_token) return json({ success: false, message: "Token required" }, 400);
      if (!clock_log_id) return json({ success: false, message: "clock_log_id required" }, 400);

      const { data: report } = await supabase
        .from("timecard_reports")
        .select("id, status, staff_id")
        .eq("access_token", access_token)
        .maybeSingle();

      if (!report) return json({ success: false, message: "Report not found" }, 404);
      if (report.status === "approved" || report.status === "employee_approved") return json({ success: false, message: "Report already approved" }, 400);

      // Get original shift data
      const { data: shift } = await supabase
        .from("clock_logs")
        .select("clock_in_time, clock_out_time, duration_minutes")
        .eq("id", clock_log_id)
        .eq("staff_id", report.staff_id)
        .maybeSingle();

      if (!shift) return json({ success: false, message: "Shift not found" }, 404);

      // Calculate proposed duration - either from proposed_hours directly or from times
      let proposedDuration: number | null = null;
      if (proposed_hours != null && proposed_hours >= 0) {
        proposedDuration = Math.round(proposed_hours * 60);
      } else {
        const pIn = proposed_clock_in || shift.clock_in_time;
        const pOut = proposed_clock_out || shift.clock_out_time;
        if (pIn && pOut) {
          proposedDuration = Math.round((new Date(pOut).getTime() - new Date(pIn).getTime()) / 60000);
          if (proposedDuration < 0) proposedDuration = 0;
        }
      }

      // Upsert: delete existing pending correction for this shift, then insert new one
      await supabase
        .from("timecard_corrections")
        .delete()
        .eq("timecard_report_id", report.id)
        .eq("clock_log_id", clock_log_id)
        .eq("approval_status", "pending");

      const { data: correction, error: corrErr } = await supabase
        .from("timecard_corrections")
        .insert({
          timecard_report_id: report.id,
          clock_log_id,
          original_clock_in: shift.clock_in_time,
          original_clock_out: shift.clock_out_time,
          proposed_clock_in: proposed_clock_in || shift.clock_in_time,
          proposed_clock_out: proposed_clock_out || shift.clock_out_time,
          proposed_duration_minutes: proposedDuration,
          proposed_hours: proposed_hours != null ? proposed_hours : null,
          note: note?.trim() || null,
          approval_status: "pending",
        })
        .select("id")
        .single();

      if (corrErr) return json({ success: false, message: corrErr.message }, 500);

      // Mark report as having notes so admin sees it needs attention
      await supabase
        .from("timecard_reports")
        .update({ status: "has_notes" })
        .eq("id", report.id);

      return json({ success: true, correction_id: correction.id, status: "pending_approval" });
    }

    // --- DELETE CORRECTION ---
    if (req.method === "DELETE" && path === "/corrections") {
      const { access_token, correction_id } = await req.json();
      if (!access_token || !correction_id) return json({ success: false, message: "access_token and correction_id required" }, 400);

      const { data: report } = await supabase
        .from("timecard_reports")
        .select("id, status")
        .eq("access_token", access_token)
        .maybeSingle();

      if (!report) return json({ success: false, message: "Report not found" }, 404);
      if (report.status === "approved" || report.status === "employee_approved") return json({ success: false, message: "Report already approved" }, 400);

      await supabase
        .from("timecard_corrections")
        .delete()
        .eq("id", correction_id)
        .eq("timecard_report_id", report.id);

      return json({ success: true });
    }

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
      if (report.status === "approved" || report.status === "employee_approved") {
        return json({ success: true, message: "Already approved" });
      }

      const { error } = await supabase
        .from("timecard_reports")
        .update({ status: "employee_approved", approved_at: new Date().toISOString() })
        .eq("id", report.id);

      if (error) return json({ success: false, message: error.message }, 500);
      return json({ success: true });
    }

    // --- ADMIN CORRECTIONS (admin overrides shift times) ---
    if (req.method === "POST" && path === "/admin-corrections") {
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

      const { report_id, clock_log_id, proposed_clock_in, proposed_clock_out, break_edits, note } = await req.json();
      if (!report_id || !clock_log_id) return json({ success: false, message: "report_id and clock_log_id required" }, 400);

      const { data: report } = await supabase
        .from("timecard_reports")
        .select("id, staff_id, pay_period_id, status")
        .eq("id", report_id)
        .maybeSingle();

      if (!report) return json({ success: false, message: "Report not found" }, 404);

      // Get original shift data
      const { data: shift } = await supabase
        .from("clock_logs")
        .select("clock_in_time, clock_out_time, duration_minutes")
        .eq("id", clock_log_id)
        .eq("staff_id", report.staff_id)
        .maybeSingle();

      if (!shift) return json({ success: false, message: "Shift not found" }, 404);

      // Calculate proposed duration
      const pIn = proposed_clock_in || shift.clock_in_time;
      const pOut = proposed_clock_out || shift.clock_out_time;
      let proposedDuration: number | null = null;
      if (pIn && pOut) {
        proposedDuration = Math.round((new Date(pOut).getTime() - new Date(pIn).getTime()) / 60000);
        if (proposedDuration < 0) proposedDuration = 0;
      }

      // Upsert correction
      await supabase
        .from("timecard_corrections")
        .delete()
        .eq("timecard_report_id", report.id)
        .eq("clock_log_id", clock_log_id);

      const { error: corrErr } = await supabase
        .from("timecard_corrections")
        .insert({
          timecard_report_id: report.id,
          clock_log_id,
          original_clock_in: shift.clock_in_time,
          original_clock_out: shift.clock_out_time,
          proposed_clock_in: proposed_clock_in || shift.clock_in_time,
          proposed_clock_out: proposed_clock_out || shift.clock_out_time,
          proposed_duration_minutes: proposedDuration,
          note: note?.trim() || null,
          approval_status: "approved",
          approved_by: admin.id,
          approved_at: new Date().toISOString(),
        });

      if (corrErr) return json({ success: false, message: corrErr.message }, 500);

      // Handle break/lunch time edits
      if (break_edits) {
        const { break_start, break_end, lunch_start, lunch_end } = break_edits;

        // Update or create regular break
        if (break_start || break_end) {
          const { data: existingBreak } = await supabase
            .from("break_logs")
            .select("id")
            .eq("clock_log_id", clock_log_id)
            .neq("break_type", "lunch")
            .maybeSingle();

          const breakDuration = (break_start && break_end)
            ? Math.round((new Date(break_end).getTime() - new Date(break_start).getTime()) / 60000)
            : null;

          if (existingBreak) {
            await supabase.from("break_logs").update({
              break_start: break_start || undefined,
              break_end: break_end || undefined,
              duration_minutes: breakDuration,
            }).eq("id", existingBreak.id);
          } else if (break_start) {
            await supabase.from("break_logs").insert({
              clock_log_id,
              staff_id: report.staff_id,
              break_start,
              break_end: break_end || null,
              duration_minutes: breakDuration,
              break_type: "break",
            });
          }
        } else {
          // If both cleared, delete existing break
          await supabase.from("break_logs").delete()
            .eq("clock_log_id", clock_log_id)
            .neq("break_type", "lunch");
        }

        // Update or create lunch break
        if (lunch_start || lunch_end) {
          const { data: existingLunch } = await supabase
            .from("break_logs")
            .select("id")
            .eq("clock_log_id", clock_log_id)
            .eq("break_type", "lunch")
            .maybeSingle();

          const lunchDuration = (lunch_start && lunch_end)
            ? Math.round((new Date(lunch_end).getTime() - new Date(lunch_start).getTime()) / 60000)
            : null;

          if (existingLunch) {
            await supabase.from("break_logs").update({
              break_start: lunch_start || undefined,
              break_end: lunch_end || undefined,
              duration_minutes: lunchDuration,
            }).eq("id", existingLunch.id);
          } else if (lunch_start) {
            await supabase.from("break_logs").insert({
              clock_log_id,
              staff_id: report.staff_id,
              break_start: lunch_start,
              break_end: lunch_end || null,
              duration_minutes: lunchDuration,
              break_type: "lunch",
            });
          }
        } else {
          // If both cleared, delete existing lunch
          await supabase.from("break_logs").delete()
            .eq("clock_log_id", clock_log_id)
            .eq("break_type", "lunch");
        }
      }

      // Recalculate total hours using only approved corrections
      const { data: ppData } = await supabase
        .from("pay_periods")
        .select("start_date, end_date")
        .eq("id", report.pay_period_id)
        .single();

      const { data: allShifts } = await supabase
        .from("clock_logs")
        .select("id, duration_minutes")
        .eq("staff_id", report.staff_id)
        .gte("clock_in_time", ppData!.start_date + "T00:00:00")
        .lte("clock_in_time", ppData!.end_date + "T23:59:59");

      const { data: allCorrections } = await supabase
        .from("timecard_corrections")
        .select("clock_log_id, proposed_duration_minutes")
        .eq("timecard_report_id", report.id)
        .eq("approval_status", "approved");

      const corrMap = new Map((allCorrections || []).map((c: { clock_log_id: string; proposed_duration_minutes: number }) => [c.clock_log_id, c.proposed_duration_minutes]));

      let totalMinutes = 0;
      for (const s of (allShifts || [])) {
        totalMinutes += corrMap.has(s.id) ? (corrMap.get(s.id) || 0) : (s.duration_minutes || 0);
      }

      // Deduct breaks only for non-corrected shifts
      const { data: allBreaks } = await supabase
        .from("break_logs")
        .select("clock_log_id, duration_minutes, break_type")
        .eq("staff_id", report.staff_id)
        .eq("break_type", "lunch")
        .gte("break_start", ppData!.start_date + "T00:00:00")
        .lte("break_start", ppData!.end_date + "T23:59:59");

      let lunchMinutes = 0;
      for (const b of (allBreaks || [])) {
        if (!corrMap.has(b.clock_log_id)) {
          lunchMinutes += b.duration_minutes || 0;
        }
      }

      const netHours = Math.round(((totalMinutes - lunchMinutes) / 60) * 100) / 100;
      await supabase
        .from("timecard_reports")
        .update({ total_hours: netHours })
        .eq("id", report.id);

      return json({ success: true, new_total_hours: netHours });
    }

    // --- APPROVE EMPLOYEE CORRECTION (admin approves a pending correction) ---
    if (req.method === "POST" && path === "/approve-correction") {
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

      const { correction_id } = await req.json();
      if (!correction_id) return json({ success: false, message: "correction_id required" }, 400);

      const { data: correction } = await supabase
        .from("timecard_corrections")
        .select("id, timecard_report_id, clock_log_id, proposed_duration_minutes, approval_status")
        .eq("id", correction_id)
        .maybeSingle();

      if (!correction) return json({ success: false, message: "Correction not found" }, 404);
      if (correction.approval_status !== "pending") return json({ success: false, message: "Correction already processed" }, 400);

      // Mark as approved
      await supabase
        .from("timecard_corrections")
        .update({ approval_status: "approved", approved_by: admin.id, approved_at: new Date().toISOString() })
        .eq("id", correction_id);

      // Recalculate total hours for report
      const { data: report } = await supabase
        .from("timecard_reports")
        .select("id, staff_id, pay_period_id")
        .eq("id", correction.timecard_report_id)
        .single();

      const { data: ppData2 } = await supabase
        .from("pay_periods")
        .select("start_date, end_date")
        .eq("id", report!.pay_period_id)
        .single();

      const { data: allShifts2 } = await supabase
        .from("clock_logs")
        .select("id, duration_minutes")
        .eq("staff_id", report!.staff_id)
        .gte("clock_in_time", ppData2!.start_date + "T00:00:00")
        .lte("clock_in_time", ppData2!.end_date + "T23:59:59");

      const { data: approvedCorrs } = await supabase
        .from("timecard_corrections")
        .select("clock_log_id, proposed_duration_minutes")
        .eq("timecard_report_id", report!.id)
        .eq("approval_status", "approved");

      const corrMap2 = new Map((approvedCorrs || []).map((c: { clock_log_id: string; proposed_duration_minutes: number }) => [c.clock_log_id, c.proposed_duration_minutes]));

      let totalMin = 0;
      for (const s of (allShifts2 || [])) {
        totalMin += corrMap2.has(s.id) ? (corrMap2.get(s.id) || 0) : (s.duration_minutes || 0);
      }

      const { data: allBreaks2 } = await supabase
        .from("break_logs")
        .select("clock_log_id, duration_minutes, break_type")
        .eq("staff_id", report!.staff_id)
        .eq("break_type", "lunch")
        .gte("break_start", ppData2!.start_date + "T00:00:00")
        .lte("break_start", ppData2!.end_date + "T23:59:59");

      let lunchMin = 0;
      for (const b of (allBreaks2 || [])) {
        if (!corrMap2.has(b.clock_log_id)) lunchMin += b.duration_minutes || 0;
      }

      const newHours = Math.round(((totalMin - lunchMin) / 60) * 100) / 100;
      await supabase
        .from("timecard_reports")
        .update({ total_hours: newHours })
        .eq("id", report!.id);

      return json({ success: true, new_total_hours: newHours });
    }

    // --- REJECT EMPLOYEE CORRECTION ---
    if (req.method === "POST" && path === "/reject-correction") {
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

      const { correction_id, reason } = await req.json();
      if (!correction_id) return json({ success: false, message: "correction_id required" }, 400);

      const { data: correction } = await supabase
        .from("timecard_corrections")
        .select("id, approval_status")
        .eq("id", correction_id)
        .maybeSingle();

      if (!correction) return json({ success: false, message: "Correction not found" }, 404);
      if (correction.approval_status !== "pending") return json({ success: false, message: "Correction already processed" }, 400);

      await supabase
        .from("timecard_corrections")
        .update({
          approval_status: "rejected",
          approved_by: admin.id,
          approved_at: new Date().toISOString(),
          rejection_reason: reason?.trim() || null,
        })
        .eq("id", correction_id);

      return json({ success: true });
    }

    // --- ADMIN APPROVE (manager finalizes and sends final hours email) ---
    if (req.method === "POST" && path === "/admin-approve") {
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

      const { report_id } = await req.json();
      if (!report_id) return json({ success: false, message: "report_id required" }, 400);

      const { data: report } = await supabase
        .from("timecard_reports")
        .select("id, staff_id, pay_period_id, total_hours, overtime_hours, status, access_token")
        .eq("id", report_id)
        .maybeSingle();

      if (!report) return json({ success: false, message: "Report not found" }, 404);
      if (report.status === "approved") {
        return json({ success: true, message: "Already approved by admin" });
      }

      const { data: staff } = await supabase
        .from("staff")
        .select("name, email")
        .eq("id", report.staff_id)
        .maybeSingle();

      const { data: payPeriod } = await supabase
        .from("pay_periods")
        .select("start_date, end_date")
        .eq("id", report.pay_period_id)
        .maybeSingle();

      const { error } = await supabase
        .from("timecard_reports")
        .update({
          status: "approved",
          admin_approved_at: new Date().toISOString(),
          admin_approved_by: user.id,
        })
        .eq("id", report.id);

      if (error) return json({ success: false, message: error.message }, 500);

      // Send final hours confirmation email to employee with full timecard snapshot
      let emailSent = false;
      if (staff?.email && payPeriod) {
        try {
          const resendKey = Deno.env.get("RESEND_API_KEY");
          if (resendKey) {
            // Fetch all shift data for snapshot
            const { data: shifts } = await supabase
              .from("clock_logs")
              .select("id, clock_in_time, clock_out_time, duration_minutes")
              .eq("staff_id", report.staff_id)
              .gte("clock_in_time", payPeriod.start_date + "T00:00:00")
              .lte("clock_in_time", payPeriod.end_date + "T23:59:59")
              .order("clock_in_time");

            const { data: breaks } = await supabase
              .from("break_logs")
              .select("clock_log_id, break_start, break_end, duration_minutes, break_type")
              .eq("staff_id", report.staff_id)
              .gte("break_start", payPeriod.start_date + "T00:00:00")
              .lte("break_start", payPeriod.end_date + "T23:59:59");

            const { data: corrections } = await supabase
              .from("timecard_corrections")
              .select("clock_log_id, proposed_clock_in, proposed_clock_out, proposed_duration_minutes, note")
              .eq("timecard_report_id", report.id);

            const corrMap = new Map((corrections || []).map((c: { clock_log_id: string; proposed_clock_in: string; proposed_clock_out: string; proposed_duration_minutes: number; note: string | null }) => [c.clock_log_id, c]));

            // Build week data (Sat-Fri, 2 weeks)
            const DAY_NAMES = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];
            const ppStart = new Date(payPeriod.start_date + "T00:00:00");

            function fmtTimeEST(iso: string): string {
              return new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
            }
            function getShiftDateKey(iso: string): string {
              return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
            }
            function fmtDecimal(mins: number): string {
              return mins > 0 ? (mins / 60).toFixed(2) : "";
            }

            let tableRows = "";
            let grandTotal = 0;
            const OT_THRESHOLD = 40 * 60;

            for (let w = 0; w < 2; w++) {
              const weekStart = new Date(ppStart);
              weekStart.setDate(ppStart.getDate() + w * 7);

              // Week header
              const weekEndD = new Date(weekStart);
              weekEndD.setDate(weekStart.getDate() + 6);
              const wLabel = `Week ${w + 1}`;
              tableRows += `<tr><td colspan="7" style="background:#f1f5f9;padding:8px 12px;font-weight:700;font-size:12px;color:#475569;border-bottom:1px solid #e2e8f0;">${wLabel}</td></tr>`;

              let weekTotal = 0;

              for (let d = 0; d < 7; d++) {
                const curDate = new Date(weekStart);
                curDate.setDate(weekStart.getDate() + d);
                const dateKey = `${curDate.getFullYear()}-${String(curDate.getMonth() + 1).padStart(2, "0")}-${String(curDate.getDate()).padStart(2, "0")}`;

                const dayShifts = (shifts || []).filter((s: { clock_in_time: string }) => getShiftDateKey(s.clock_in_time) === dateKey);
                const shift = dayShifts.length > 0 ? dayShifts[0] : null;

                let startTime = "";
                let endTime = "";
                let lunchOut = "";
                let lunchIn = "";
                let netMins = 0;

                if (shift) {
                  const corr = corrMap.get(shift.id);
                  if (corr) {
                    startTime = fmtTimeEST(corr.proposed_clock_in);
                    endTime = fmtTimeEST(corr.proposed_clock_out);
                    netMins = corr.proposed_duration_minutes || 0;
                  } else {
                    startTime = fmtTimeEST(shift.clock_in_time);
                    endTime = shift.clock_out_time ? fmtTimeEST(shift.clock_out_time) : "open";
                    const shiftBreaks = (breaks || []).filter((b: { clock_log_id: string }) => b.clock_log_id === shift.id);
                    const lunchMin = shiftBreaks.filter((b: { break_type: string }) => b.break_type === "lunch").reduce((sum: number, b: { duration_minutes: number | null }) => sum + (b.duration_minutes || 0), 0);
                    netMins = Math.max(0, (shift.duration_minutes || 0) - lunchMin);

                    const lunch = shiftBreaks.find((b: { break_type: string }) => b.break_type === "lunch");
                    if (lunch) {
                      lunchOut = fmtTimeEST(lunch.break_start);
                      lunchIn = lunch.break_end ? fmtTimeEST(lunch.break_end) : "";
                    }
                  }
                }

                weekTotal += netMins;

                const bgColor = d < 2 ? "#fafafa" : "#ffffff";
                tableRows += `<tr style="background:${bgColor};border-bottom:1px solid #f1f5f9;">
                  <td style="padding:6px 12px;font-weight:600;font-size:13px;color:#374151;">${DAY_NAMES[d]}</td>
                  <td style="padding:6px 8px;font-size:13px;color:#4b5563;">${startTime}</td>
                  <td style="padding:6px 8px;font-size:12px;color:#6b7280;">${lunchOut}</td>
                  <td style="padding:6px 8px;font-size:12px;color:#6b7280;">${lunchIn}</td>
                  <td style="padding:6px 8px;font-size:13px;color:#4b5563;">${endTime}</td>
                  <td style="padding:6px 8px;font-size:13px;color:#374151;font-weight:600;text-align:right;">${fmtDecimal(netMins)}</td>
                  <td style="padding:6px 8px;font-size:13px;color:#ea580c;font-weight:600;text-align:right;"></td>
                </tr>`;
              }

              // Week subtotal
              const weekOT = Math.max(0, weekTotal - OT_THRESHOLD);
              const weekReg = weekTotal - weekOT;
              grandTotal += weekTotal;

              tableRows += `<tr style="background:#f1f5f9;border-bottom:2px solid #e2e8f0;">
                <td colspan="5" style="padding:6px 12px;font-weight:700;font-size:12px;color:#475569;">${wLabel} Subtotal</td>
                <td style="padding:6px 8px;font-size:13px;font-weight:700;color:#1e40af;text-align:right;">${fmtDecimal(weekReg)}</td>
                <td style="padding:6px 8px;font-size:13px;font-weight:700;color:#ea580c;text-align:right;">${weekOT > 0 ? fmtDecimal(weekOT) : ""}</td>
              </tr>`;
            }

            // Grand total row
            const totalOT = report.overtime_hours * 60;
            const totalReg = grandTotal - totalOT;
            tableRows += `<tr style="background:#e2e8f0;">
              <td colspan="5" style="padding:8px 12px;font-weight:700;font-size:13px;color:#1e293b;">Period Total</td>
              <td style="padding:8px 8px;font-size:14px;font-weight:700;color:#1e40af;text-align:right;">${fmtDecimal(totalReg)}</td>
              <td style="padding:8px 8px;font-size:14px;font-weight:700;color:#ea580c;text-align:right;">${totalOT > 0 ? fmtDecimal(totalOT) : ""}</td>
            </tr>`;

            const timecardTable = `
              <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:20px;">
                <thead>
                  <tr style="background:#355574;">
                    <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:white;">Day</th>
                    <th style="padding:10px 8px;text-align:left;font-size:12px;font-weight:600;color:white;">Start</th>
                    <th style="padding:10px 8px;text-align:left;font-size:11px;font-weight:600;color:rgba(255,255,255,0.8);">Lunch Out</th>
                    <th style="padding:10px 8px;text-align:left;font-size:11px;font-weight:600;color:rgba(255,255,255,0.8);">Lunch In</th>
                    <th style="padding:10px 8px;text-align:left;font-size:12px;font-weight:600;color:white;">End</th>
                    <th style="padding:10px 8px;text-align:right;font-size:12px;font-weight:600;color:white;">Reg</th>
                    <th style="padding:10px 8px;text-align:right;font-size:12px;font-weight:600;color:#fdba74;">OT</th>
                  </tr>
                </thead>
                <tbody>${tableRows}</tbody>
              </table>`;

            const emailRes = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${resendKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: "Moja Time Clock <timeclock@mojakids.com>",
                to: [staff.email],
                subject: `Final Hours Confirmed - ${payPeriod.start_date} to ${payPeriod.end_date}`,
                html: `
                  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 640px; margin: 0 auto; padding: 20px;">
                    <div style="background: #355574; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
                      <h1 style="color: white; margin: 0; font-size: 22px;">Hours Confirmed</h1>
                      <p style="color: rgba(255,255,255,0.7); margin: 4px 0 0;">Pay period: ${payPeriod.start_date} to ${payPeriod.end_date}</p>
                    </div>
                    <div style="background: #f0fdf4; border: 2px solid #bbf7d0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                      <p style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #166534;">Your timecard has been approved!</p>
                      <p style="margin: 0; color: #555; line-height: 1.5;">Hi ${staff.name.split(" ")[0]}, your manager has reviewed and approved your hours for this pay period.</p>
                    </div>
                    <div style="background: white; border: 2px solid #bbf7d0; border-radius: 12px; padding: 20px; margin-bottom: 24px; text-align: center;">
                      <p style="margin: 0 0 4px; font-size: 14px; color: #666;">Final Confirmed Hours</p>
                      <p style="margin: 0; font-size: 36px; font-weight: bold; color: #166534;">${report.total_hours.toFixed(1)}h</p>
                      ${report.overtime_hours > 0 ? `<p style="margin: 8px 0 0; font-size: 14px; color: #e66d38; font-weight: 600;">Includes ${report.overtime_hours.toFixed(1)}h overtime</p>` : ""}
                    </div>
                    <h2 style="font-size: 15px; color: #374151; margin: 0 0 12px; font-weight: 700;">Timecard Details</h2>
                    ${timecardTable}
                    <p style="color: #999; font-size: 12px; text-align: center; margin-top: 24px;">Moja Behavioral Services Time Clock</p>
                  </div>
                `,
              }),
            });
            emailSent = emailRes.ok;
          }
        } catch (_emailErr) {
          // Email failure shouldn't block approval
        }
      }

      return json({ success: true, email_sent: emailSent });
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
        .in("status", ["has_notes", "pending_review", "employee_approved"])
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
        let live_lunch_minutes = 0;

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
            .eq("break_type", "lunch")
            .gte("break_start", pp.start_date + "T00:00:00")
            .lte("break_start", pp.end_date + "T23:59:59");

          live_lunch_minutes = (breaks || []).reduce((sum: number, b: { duration_minutes: number | null }) => sum + (b.duration_minutes || 0), 0);
        }

        reportsWithLiveData.push({
          ...report,
          notes: notes || [],
          shift_count,
          has_open_shift,
          live_total_hours: Math.round(((live_total_minutes - live_lunch_minutes) / 60) * 100) / 100,
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
          id, staff_id, pay_period_id, total_hours, overtime_hours, status, generated_at, approved_at, admin_approved_at, admin_approved_by,
          pay_periods (start_date, end_date, status),
          staff (name, email)
        `)
        .eq("status", "approved")
        .order("generated_at", { ascending: false })
        .limit(100);

      // Enrich with live shift data
      const enriched = [];
      for (const report of (reports || [])) {
        const pp = report.pay_periods as { start_date: string; end_date: string; status: string } | null;
        let shift_count = 0;
        let has_open_shift = false;
        let live_total_minutes = 0;
        let live_lunch_minutes = 0;

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
            .eq("break_type", "lunch")
            .gte("break_start", pp.start_date + "T00:00:00")
            .lte("break_start", pp.end_date + "T23:59:59");

          live_lunch_minutes = (breaks || []).reduce((sum: number, b: { duration_minutes: number | null }) => sum + (b.duration_minutes || 0), 0);
        }

        enriched.push({
          ...report,
          shift_count,
          has_open_shift,
          live_total_hours: Math.round(((live_total_minutes - live_lunch_minutes) / 60) * 100) / 100,
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
        .select("id, staff_id, pay_period_id, total_hours, overtime_hours, status, generated_at, approved_at, admin_approved_at, admin_approved_by")
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

      const { data: corrections } = await supabase
        .from("timecard_corrections")
        .select("id, clock_log_id, original_clock_in, original_clock_out, proposed_clock_in, proposed_clock_out, proposed_duration_minutes, proposed_hours, approval_status, rejection_reason, note, created_at")
        .eq("timecard_report_id", report.id)
        .order("created_at");

      return json({
        success: true,
        report: { ...report, staff_name: staff?.name, staff_email: staff?.email, pay_period: payPeriod },
        shifts: shifts || [],
        breaks: breaks || [],
        notes: notes || [],
        corrections: corrections || [],
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
