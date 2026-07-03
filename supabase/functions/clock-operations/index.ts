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

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function isPasswordLeaked(password: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  const prefix = hashHex.slice(0, 5);
  const suffix = hashHex.slice(5);

  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "User-Agent": "MojaTimeClock-PasswordCheck" },
    });
    if (!response.ok) return false;
    const text = await response.text();
    return text.split("\n").some(line => line.startsWith(suffix));
  } catch {
    return false;
  }
}

function toEST(date: Date): Date {
  const estStr = date.toLocaleString("en-US", { timeZone: "America/New_York" });
  return new Date(estStr);
}

function toESTISO(date: Date): string {
  const est = toEST(date);
  const offset = date.getTime() - est.getTime();
  const offsetHours = Math.round(offset / 3600000);
  const sign = offsetHours <= 0 ? "+" : "-";
  const absOffset = Math.abs(offsetHours);
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = est.getFullYear();
  const m = pad(est.getMonth() + 1);
  const d = pad(est.getDate());
  const h = pad(est.getHours());
  const min = pad(est.getMinutes());
  const s = pad(est.getSeconds());
  return `${y}-${m}-${d}T${h}:${min}:${s}${sign}${pad(absOffset)}:00`;
}

function nowEST(): string {
  return toESTISO(new Date());
}

function getWeekEnding(date: Date): string {
  const est = toEST(date);
  const day = est.getDay();
  const diff = day === 0 ? 0 : 7 - day;
  est.setDate(est.getDate() + diff);
  const y = est.getFullYear();
  const m = String(est.getMonth() + 1).padStart(2, "0");
  const dd = String(est.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function getWeekStart(date: Date): Date {
  const est = toEST(date);
  const day = est.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  est.setDate(est.getDate() + diff);
  est.setHours(0, 0, 0, 0);
  return est;
}

async function checkRateLimit(
  supabase: ReturnType<typeof createClient>,
  ipAddress: string
): Promise<boolean> {
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("pin_attempts")
    .select("id")
    .eq("ip_address", ipAddress)
    .eq("success", false)
    .gte("attempted_at", fifteenMinAgo);

  return (data?.length || 0) >= 5;
}

async function recordAttempt(
  supabase: ReturnType<typeof createClient>,
  ipAddress: string,
  success: boolean
) {
  await supabase.from("pin_attempts").insert({
    ip_address: ipAddress,
    success,
    attempted_at: nowEST(),
  });
}

async function getBreakMinutes(
  supabase: ReturnType<typeof createClient>,
  clockLogId: string
): Promise<number> {
  const { data: breaks } = await supabase
    .from("break_logs")
    .select("duration_minutes")
    .eq("clock_log_id", clockLogId)
    .not("duration_minutes", "is", null);

  if (!breaks || breaks.length === 0) return 0;
  return breaks.reduce(
    (sum: number, b: { duration_minutes: number }) => sum + (b.duration_minutes || 0),
    0
  );
}

async function getWeeklyTotal(
  supabase: ReturnType<typeof createClient>,
  staffId: string
): Promise<number> {
  const weekStart = getWeekStart(new Date());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const { data: logs } = await supabase
    .from("clock_logs")
    .select("id, duration_minutes")
    .eq("staff_id", staffId)
    .gte("clock_in_time", weekStart.toISOString())
    .lte("clock_in_time", weekEnd.toISOString())
    .not("duration_minutes", "is", null);

  if (!logs || logs.length === 0) return 0;
  const grossMinutes = logs.reduce(
    (sum: number, l: { duration_minutes: number }) => sum + (l.duration_minutes || 0),
    0
  );

  const logIds = logs.map((l: { id: string }) => l.id);
  const { data: lunches } = await supabase
    .from("break_logs")
    .select("duration_minutes")
    .in("clock_log_id", logIds)
    .eq("break_type", "lunch")
    .not("duration_minutes", "is", null);

  const lunchMinutes = (lunches || []).reduce(
    (sum: number, b: { duration_minutes: number }) => sum + (b.duration_minutes || 0),
    0
  );

  return grossMinutes - lunchMinutes;
}

async function verifyAdmin(
  supabase: ReturnType<typeof createClient>,
  req: Request
): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;

  const token = authHeader.replace("Bearer ", "");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  if (token === anonKey) return null;

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return null;

  const { data: admin } = await supabase
    .from("admins")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  return admin ? user.id : null;
}

async function getAutoClockOutHours(
  supabase: ReturnType<typeof createClient>
): Promise<number> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "auto_clock_out_hours")
    .maybeSingle();
  return data?.value ? Number(data.value) : 16;
}

async function autoCloseStaleShifts(
  supabase: ReturnType<typeof createClient>,
  maxHours: number
): Promise<number> {
  const cutoff = new Date(Date.now() - maxHours * 60 * 60 * 1000);

  const { data: staleShifts } = await supabase
    .from("clock_logs")
    .select("id, staff_id, clock_in_time, notes")
    .is("clock_out_time", null)
    .lt("clock_in_time", cutoff.toISOString());

  if (!staleShifts || staleShifts.length === 0) return 0;

  let closed = 0;
  for (const shift of staleShifts) {
    const clockIn = new Date(shift.clock_in_time);
    const autoOut = new Date(clockIn.getTime() + maxHours * 60 * 60 * 1000);
    const durationMinutes = maxHours * 60;

    // Close any open breaks for this shift
    const { data: openBreaks } = await supabase
      .from("break_logs")
      .select("id, break_start")
      .eq("clock_log_id", shift.id)
      .is("break_end", null);

    for (const brk of (openBreaks || [])) {
      const breakDur = Math.round((autoOut.getTime() - new Date(brk.break_start).getTime()) / 60000);
      await supabase.from("break_logs").update({
        break_end: toESTISO(autoOut),
        duration_minutes: breakDur,
      }).eq("id", brk.id);
    }

    const newNote = `[${toESTISO(autoOut).replace("T", " ").slice(0, 16)}] Auto clock-out: shift exceeded ${maxHours}h limit`;
    const notes = shift.notes ? `${shift.notes}\n${newNote}` : newNote;

    await supabase.from("clock_logs").update({
      clock_out_time: toESTISO(autoOut),
      duration_minutes: durationMinutes,
      notes,
    }).eq("id", shift.id);

    await supabase.from("staff").update({
      is_clocked_in: false,
      is_on_break: false,
    }).eq("id", shift.staff_id);

    closed++;
  }

  return closed;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const url = new URL(req.url);
    const path = url.pathname.replace("/clock-operations", "");
    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      "unknown";

    // --- ADMIN SETUP (first admin only) ---
    if (req.method === "POST" && path === "/setup-admin") {
      const { name, email, password } = await req.json();

      if (!name || !email || !password) {
        return json({ success: false, message: "Name, email, and password are required" }, 400);
      }

      if (!isValidEmail(email)) {
        return json({ success: false, message: "Invalid email format" }, 400);
      }

      if (password.length < 6) {
        return json({ success: false, message: "Password must be at least 6 characters" }, 400);
      }

      if (await isPasswordLeaked(password)) {
        return json({ success: false, message: "This password has appeared in a data breach. Please choose a different password." }, 400);
      }

      const { data: existingAdmins } = await supabase
        .from("admins")
        .select("id")
        .limit(1);

      if (existingAdmins && existingAdmins.length > 0) {
        return json({ success: false, message: "An admin account already exists" }, 403);
      }

      const { data: authData, error: signUpError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (signUpError || !authData.user) {
        return json({
          success: false,
          message: signUpError?.message || "Failed to create account",
        }, 400);
      }

      const { error: adminError } = await supabase.from("admins").insert({
        id: authData.user.id,
        email,
        name,
      });

      if (adminError) {
        await supabase.auth.admin.deleteUser(authData.user.id);
        return json({ success: false, message: "Failed to create admin record" }, 500);
      }

      return json({ success: true, message: "Admin account created successfully" });
    }

    // --- CREATE ADDITIONAL ADMIN (requires existing admin) ---
    if (req.method === "POST" && path === "/admin/create-admin") {
      const adminId = await verifyAdmin(supabase, req);
      if (!adminId) {
        return json({ success: false, message: "Unauthorized" }, 401);
      }

      const { name, email, password } = await req.json();

      if (!name || !email || !password) {
        return json({ success: false, message: "Name, email, and password are required" }, 400);
      }

      if (!isValidEmail(email)) {
        return json({ success: false, message: "Invalid email format" }, 400);
      }

      if (password.length < 6) {
        return json({ success: false, message: "Password must be at least 6 characters" }, 400);
      }

      if (await isPasswordLeaked(password)) {
        return json({ success: false, message: "This password has appeared in a data breach. Please choose a different password." }, 400);
      }

      const { data: authData, error: signUpError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (signUpError || !authData.user) {
        return json({
          success: false,
          message: signUpError?.message || "Failed to create account",
        }, 400);
      }

      const { error: adminError } = await supabase.from("admins").insert({
        id: authData.user.id,
        email,
        name,
      });

      if (adminError) {
        await supabase.auth.admin.deleteUser(authData.user.id);
        return json({ success: false, message: adminError.message || "Failed to create admin record" }, 500);
      }

      return json({ success: true, message: `Admin account created for ${email}` });
    }

    // --- LIST ADMINS ---
    if (req.method === "GET" && path === "/admin/list-admins") {
      const adminId = await verifyAdmin(supabase, req);
      if (!adminId) {
        return json({ success: false, message: "Unauthorized" }, 401);
      }

      const { data: admins } = await supabase
        .from("admins")
        .select("id, email, name, created_at")
        .order("created_at");

      return json({ success: true, admins: admins || [] });
    }

    // --- REMOVE ADMIN ---
    if (req.method === "POST" && path === "/admin/remove-admin") {
      const adminId = await verifyAdmin(supabase, req);
      if (!adminId) {
        return json({ success: false, message: "Unauthorized" }, 401);
      }

      const { admin_id } = await req.json();

      if (!admin_id) {
        return json({ success: false, message: "admin_id is required" }, 400);
      }

      if (admin_id === adminId) {
        return json({ success: false, message: "You cannot remove yourself" }, 400);
      }

      const { data: adminCount } = await supabase
        .from("admins")
        .select("id")
        .limit(2);

      if (!adminCount || adminCount.length <= 1) {
        return json({ success: false, message: "Cannot remove the last admin" }, 400);
      }

      const { error: deleteAdminError } = await supabase
        .from("admins")
        .delete()
        .eq("id", admin_id);

      if (deleteAdminError) {
        return json({ success: false, message: "Failed to remove admin" }, 500);
      }

      await supabase.auth.admin.deleteUser(admin_id);

      return json({ success: true, message: "Admin removed" });
    }

    // --- PIN LOOKUP (with rate limiting) ---
    if (req.method === "POST" && path === "/lookup-pin") {
      const { pin } = await req.json();

      if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        return json({ success: false, message: "PIN must be exactly 4 digits" }, 400);
      }

      const blocked = await checkRateLimit(supabase, ipAddress);
      if (blocked) {
        return json(
          { success: false, message: "Too many failed attempts. Please wait 15 minutes." },
          429
        );
      }

      const { data: activeStaff } = await supabase
        .from("staff")
        .select("id, name, pin_hash, is_clocked_in, is_on_break")
        .eq("is_active", true);

      if (!activeStaff || activeStaff.length === 0) {
        return json({ success: false, message: "No staff found" }, 404);
      }

      let matchedStaff = null;
      for (const staff of activeStaff) {
        const valid = await bcrypt.compare(pin, staff.pin_hash);
        if (valid) {
          matchedStaff = staff;
          break;
        }
      }

      if (!matchedStaff) {
        await recordAttempt(supabase, ipAddress, false);
        return json({ success: false, message: "Invalid PIN" }, 401);
      }

      await recordAttempt(supabase, ipAddress, true);

      let breakStart = null;
      let breakType = null;
      if (matchedStaff.is_on_break) {
        const { data: openBreak } = await supabase
          .from("break_logs")
          .select("break_start, break_type")
          .eq("staff_id", matchedStaff.id)
          .is("break_end", null)
          .order("break_start", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (openBreak) {
          breakStart = openBreak.break_start;
          breakType = openBreak.break_type;
        }
      }

      return json({
        success: true,
        staff_name: matchedStaff.name,
        staff_id: matchedStaff.id,
        is_clocked_in: matchedStaff.is_clocked_in,
        is_on_break: matchedStaff.is_on_break || false,
        break_start: breakStart,
        break_type: breakType,
      });
    }

    // --- CLOCK IN BY PIN (with rate limiting and weekly total) ---
    if (req.method === "POST" && path === "/clock-in-by-pin") {
      const { pin } = await req.json();

      if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        return json({ success: false, message: "PIN must be exactly 4 digits" }, 400);
      }

      const blocked = await checkRateLimit(supabase, ipAddress);
      if (blocked) {
        return json(
          { success: false, message: "Too many failed attempts. Please wait 15 minutes." },
          429
        );
      }

      const { data: activeStaff } = await supabase
        .from("staff")
        .select("id, name, pin_hash, is_clocked_in, is_active")
        .eq("is_active", true);

      if (!activeStaff || activeStaff.length === 0) {
        return json({ success: false, message: "No active staff found" }, 404);
      }

      let matchedStaff = null;
      for (const staff of activeStaff) {
        const valid = await bcrypt.compare(pin, staff.pin_hash);
        if (valid) {
          matchedStaff = staff;
          break;
        }
      }

      if (!matchedStaff) {
        await recordAttempt(supabase, ipAddress, false);
        return json({ success: false, message: "Invalid PIN" }, 401);
      }

      await recordAttempt(supabase, ipAddress, true);

      if (matchedStaff.is_clocked_in) {
        // Check if the open shift exceeds the auto clock-out limit
        const maxHours = await getAutoClockOutHours(supabase);
        const { data: openLog } = await supabase
          .from("clock_logs")
          .select("id, clock_in_time")
          .eq("staff_id", matchedStaff.id)
          .is("clock_out_time", null)
          .order("clock_in_time", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (openLog) {
          const shiftAge = (Date.now() - new Date(openLog.clock_in_time).getTime()) / (60 * 60 * 1000);
          if (shiftAge >= maxHours) {
            // Auto-close the stale shift capped at maxHours
            const clockIn = new Date(openLog.clock_in_time);
            const autoOut = new Date(clockIn.getTime() + maxHours * 60 * 60 * 1000);
            const durationMinutes = maxHours * 60;

            const { data: openBreaks } = await supabase
              .from("break_logs")
              .select("id, break_start")
              .eq("clock_log_id", openLog.id)
              .is("break_end", null);

            for (const brk of (openBreaks || [])) {
              const breakDur = Math.round((autoOut.getTime() - new Date(brk.break_start).getTime()) / 60000);
              await supabase.from("break_logs").update({
                break_end: toESTISO(autoOut),
                duration_minutes: breakDur,
              }).eq("id", brk.id);
            }

            const newNote = `[${toESTISO(autoOut).replace("T", " ").slice(0, 16)}] Auto clock-out: shift exceeded ${maxHours}h limit`;
            await supabase.from("clock_logs").update({
              clock_out_time: toESTISO(autoOut),
              duration_minutes: durationMinutes,
              notes: newNote,
            }).eq("id", openLog.id);

            await supabase.from("staff").update({ is_clocked_in: false, is_on_break: false }).eq("id", matchedStaff.id);
          } else {
            return json(
              { success: false, message: `${matchedStaff.name} is already clocked in` },
              400
            );
          }
        }
      }

      const now = new Date();
      const weekEnding = getWeekEnding(now);

      const { error: logError } = await supabase.from("clock_logs").insert({
        staff_id: matchedStaff.id,
        clock_in_time: toESTISO(now),
        week_ending: weekEnding,
      });

      if (logError) {
        return json({ success: false, message: "Failed to create clock log" }, 500);
      }

      await supabase
        .from("staff")
        .update({ is_clocked_in: true })
        .eq("id", matchedStaff.id);

      const weeklyTotalMinutes = await getWeeklyTotal(supabase, matchedStaff.id);

      return json({
        success: true,
        timestamp: toESTISO(now),
        action: "clock_in",
        staff_name: matchedStaff.name,
        weekly_total_hours: Math.round((weeklyTotalMinutes / 60) * 10) / 10,
      });
    }

    // --- CLOCK OUT BY PIN (with break deduction and weekly total) ---
    if (req.method === "POST" && path === "/clock-out-by-pin") {
      const { pin } = await req.json();

      if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        return json({ success: false, message: "PIN must be exactly 4 digits" }, 400);
      }

      const blocked = await checkRateLimit(supabase, ipAddress);
      if (blocked) {
        return json(
          { success: false, message: "Too many failed attempts. Please wait 15 minutes." },
          429
        );
      }

      const { data: activeStaff } = await supabase
        .from("staff")
        .select("id, name, pin_hash, is_clocked_in, is_active, is_on_break")
        .eq("is_active", true);

      if (!activeStaff || activeStaff.length === 0) {
        return json({ success: false, message: "No active staff found" }, 404);
      }

      let matchedStaff = null;
      for (const staff of activeStaff) {
        const valid = await bcrypt.compare(pin, staff.pin_hash);
        if (valid) {
          matchedStaff = staff;
          break;
        }
      }

      if (!matchedStaff) {
        await recordAttempt(supabase, ipAddress, false);
        return json({ success: false, message: "Invalid PIN" }, 401);
      }

      await recordAttempt(supabase, ipAddress, true);

      if (!matchedStaff.is_clocked_in) {
        return json(
          { success: false, message: `${matchedStaff.name} is not clocked in` },
          400
        );
      }

      const now = new Date();

      // End any open break first
      if (matchedStaff.is_on_break) {
        const { data: openBreak } = await supabase
          .from("break_logs")
          .select("id, break_start")
          .eq("staff_id", matchedStaff.id)
          .is("break_end", null)
          .order("break_start", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (openBreak) {
          const breakStart = new Date(openBreak.break_start);
          const breakDuration = Math.round(
            (now.getTime() - breakStart.getTime()) / 60000
          );
          await supabase
            .from("break_logs")
            .update({ break_end: toESTISO(now), duration_minutes: breakDuration })
            .eq("id", openBreak.id);
        }

        await supabase
          .from("staff")
          .update({ is_on_break: false })
          .eq("id", matchedStaff.id);
      }

      const { data: openLog } = await supabase
        .from("clock_logs")
        .select("id, clock_in_time")
        .eq("staff_id", matchedStaff.id)
        .is("clock_out_time", null)
        .order("clock_in_time", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!openLog) {
        return json({ success: false, message: "No open clock log found" }, 400);
      }

      const clockInTime = new Date(openLog.clock_in_time);
      const totalMinutes = Math.round(
        (now.getTime() - clockInTime.getTime()) / 60000
      );

      // Cap at auto_clock_out_hours to prevent inflated hours from forgotten punches
      const maxHours = await getAutoClockOutHours(supabase);
      const maxMinutes = maxHours * 60;
      const durationMinutes = Math.min(totalMinutes, maxMinutes);
      const effectiveOut = totalMinutes > maxMinutes
        ? new Date(clockInTime.getTime() + maxMinutes * 60 * 1000)
        : now;

      await supabase
        .from("clock_logs")
        .update({
          clock_out_time: toESTISO(effectiveOut),
          duration_minutes: durationMinutes,
          ...(totalMinutes > maxMinutes ? {
            notes: `[${toESTISO(now).replace("T", " ").slice(0, 16)}] Duration capped at ${maxHours}h (actual elapsed: ${(totalMinutes / 60).toFixed(1)}h)`
          } : {}),
        })
        .eq("id", openLog.id);

      await supabase
        .from("staff")
        .update({ is_clocked_in: false })
        .eq("id", matchedStaff.id);

      const weeklyTotalMinutes = await getWeeklyTotal(supabase, matchedStaff.id);

      return json({
        success: true,
        timestamp: toESTISO(now),
        action: "clock_out",
        staff_name: matchedStaff.name,
        duration_minutes: durationMinutes,
        clock_in_time: openLog.clock_in_time,
        weekly_total_hours:
          Math.round((weeklyTotalMinutes / 60) * 10) / 10,
      });
    }

    // --- START BREAK ---
    if (req.method === "POST" && path === "/start-break") {
      const rateLimited = await checkRateLimit(supabase, ipAddress);
      if (rateLimited) {
        return json({ success: false, message: "Too many attempts. Please wait and try again." }, 429);
      }

      const { pin, break_type } = await req.json();

      if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        return json({ success: false, message: "PIN must be exactly 4 digits" }, 400);
      }

      const type = break_type === "lunch" ? "lunch" : "break";

      const { data: activeStaff } = await supabase
        .from("staff")
        .select("id, name, pin_hash, is_clocked_in, is_on_break, is_active")
        .eq("is_active", true);

      if (!activeStaff || activeStaff.length === 0) {
        return json({ success: false, message: "No active staff found" }, 404);
      }

      let matchedStaff = null;
      for (const staff of activeStaff) {
        const valid = await bcrypt.compare(pin, staff.pin_hash);
        if (valid) {
          matchedStaff = staff;
          break;
        }
      }

      if (!matchedStaff) {
        return json({ success: false, message: "Invalid PIN" }, 401);
      }

      if (!matchedStaff.is_clocked_in) {
        return json({ success: false, message: "Must be clocked in to start a break" }, 400);
      }

      if (matchedStaff.is_on_break) {
        return json({ success: false, message: "Already on break" }, 400);
      }

      const { data: openLog } = await supabase
        .from("clock_logs")
        .select("id")
        .eq("staff_id", matchedStaff.id)
        .is("clock_out_time", null)
        .order("clock_in_time", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!openLog) {
        return json({ success: false, message: "No open clock log found" }, 400);
      }

      const now = new Date();
      await supabase.from("break_logs").insert({
        clock_log_id: openLog.id,
        staff_id: matchedStaff.id,
        break_start: toESTISO(now),
        break_type: type,
      });

      await supabase
        .from("staff")
        .update({ is_on_break: true })
        .eq("id", matchedStaff.id);

      return json({
        success: true,
        timestamp: toESTISO(now),
        action: "start_break",
        break_type: type,
        staff_name: matchedStaff.name,
      });
    }

    // --- END BREAK ---
    if (req.method === "POST" && path === "/end-break") {
      const rateLimited = await checkRateLimit(supabase, ipAddress);
      if (rateLimited) {
        return json({ success: false, message: "Too many attempts. Please wait and try again." }, 429);
      }

      const { pin } = await req.json();

      if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        return json({ success: false, message: "PIN must be exactly 4 digits" }, 400);
      }

      const { data: activeStaff } = await supabase
        .from("staff")
        .select("id, name, pin_hash, is_clocked_in, is_on_break, is_active")
        .eq("is_active", true);

      if (!activeStaff || activeStaff.length === 0) {
        return json({ success: false, message: "No active staff found" }, 404);
      }

      let matchedStaff = null;
      for (const staff of activeStaff) {
        const valid = await bcrypt.compare(pin, staff.pin_hash);
        if (valid) {
          matchedStaff = staff;
          break;
        }
      }

      if (!matchedStaff) {
        return json({ success: false, message: "Invalid PIN" }, 401);
      }

      const now = new Date();

      // Find the most recent open break log regardless of is_on_break flag
      const { data: openBreak } = await supabase
        .from("break_logs")
        .select("id, break_start, break_type")
        .eq("staff_id", matchedStaff.id)
        .is("break_end", null)
        .order("break_start", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!openBreak && !matchedStaff.is_on_break) {
        return json({ success: false, message: "Not currently on break" }, 400);
      }

      let breakDuration = 0;
      let breakType = "break";

      if (openBreak) {
        const breakStart = new Date(openBreak.break_start);
        breakDuration = Math.round(
          (now.getTime() - breakStart.getTime()) / 60000
        );
        breakType = openBreak.break_type || "break";

        await supabase
          .from("break_logs")
          .update({ break_end: toESTISO(now), duration_minutes: breakDuration })
          .eq("id", openBreak.id);
      }

      // Always ensure staff flag is cleared
      if (matchedStaff.is_on_break) {
        await supabase
          .from("staff")
          .update({ is_on_break: false })
          .eq("id", matchedStaff.id);
      }

      return json({
        success: true,
        timestamp: toESTISO(now),
        action: "end_break",
        break_type: breakType,
        staff_name: matchedStaff.name,
        break_duration_minutes: breakDuration,
      });
    }

    // --- MY HOURS (employee self-service) ---
    if (req.method === "POST" && path === "/my-hours") {
      const rateLimited = await checkRateLimit(supabase, ipAddress);
      if (rateLimited) {
        return json({ success: false, message: "Too many attempts. Please wait and try again." }, 429);
      }

      const { pin } = await req.json();

      if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        return json({ success: false, message: "PIN must be exactly 4 digits" }, 400);
      }

      const { data: activeStaff } = await supabase
        .from("staff")
        .select("id, name, pin_hash, is_clocked_in, is_on_break")
        .eq("is_active", true);

      if (!activeStaff || activeStaff.length === 0) {
        return json({ success: false, message: "No staff found" }, 404);
      }

      let matchedStaff = null;
      for (const staff of activeStaff) {
        const valid = await bcrypt.compare(pin, staff.pin_hash);
        if (valid) {
          matchedStaff = staff;
          break;
        }
      }

      if (!matchedStaff) {
        return json({ success: false, message: "Invalid PIN" }, 401);
      }

      // Determine bi-weekly pay period (Saturday-Friday, cutoff every other Friday)
      // Reference: June 27, 2026 (Saturday) is a known pay period start
      // Last cutoff was Fri Jun 26, next is Fri Jul 10
      const refDate = new Date("2026-06-27T00:00:00");
      const now = toEST(new Date());
      now.setHours(0, 0, 0, 0);

      // Find the Saturday that starts the current week (Sat-Fri week)
      const dayOfWeek = now.getDay(); // 0=Sun, 6=Sat
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

      const week1Start = new Date(payPeriodStart);
      const week1End = new Date(payPeriodStart);
      week1End.setDate(week1Start.getDate() + 6);
      week1End.setHours(23, 59, 59, 999);

      const week2Start = new Date(payPeriodStart);
      week2Start.setDate(payPeriodStart.getDate() + 7);
      const week2End = new Date(payPeriodEnd);

      const { data: logs } = await supabase
        .from("clock_logs")
        .select("id, clock_in_time, clock_out_time, duration_minutes, notes")
        .eq("staff_id", matchedStaff.id)
        .gte("clock_in_time", payPeriodStart.toISOString())
        .lte("clock_in_time", payPeriodEnd.toISOString())
        .order("clock_in_time");

      const { data: breaks } = await supabase
        .from("break_logs")
        .select("clock_log_id, break_start, break_end, duration_minutes, break_type")
        .eq("staff_id", matchedStaff.id)
        .gte("break_start", payPeriodStart.toISOString())
        .lte("break_start", payPeriodEnd.toISOString());

      const allLogs = logs || [];
      const allBreaks = breaks || [];

      const week1Logs = allLogs.filter(
        (l: { clock_in_time: string }) => new Date(l.clock_in_time) <= week1End
      );
      const week2Logs = allLogs.filter(
        (l: { clock_in_time: string }) => new Date(l.clock_in_time) > week1End
      );

      const week1GrossMinutes = week1Logs.reduce(
        (sum: number, l: { duration_minutes: number | null }) => sum + (l.duration_minutes || 0),
        0
      );
      const week2GrossMinutes = week2Logs.reduce(
        (sum: number, l: { duration_minutes: number | null }) => sum + (l.duration_minutes || 0),
        0
      );

      // Deduct only lunch (unpaid); paid breaks are NOT deducted
      const week1LunchMins = allBreaks
        .filter((b: { break_start: string; break_type: string }) => new Date(b.break_start) <= week1End && b.break_type === "lunch")
        .reduce((sum: number, b: { duration_minutes: number | null }) => sum + (b.duration_minutes || 0), 0);
      const week2LunchMins = allBreaks
        .filter((b: { break_start: string; break_type: string }) => new Date(b.break_start) > week1End && b.break_type === "lunch")
        .reduce((sum: number, b: { duration_minutes: number | null }) => sum + (b.duration_minutes || 0), 0);

      const week1Minutes = week1GrossMinutes - week1LunchMins;
      const week2Minutes = week2GrossMinutes - week2LunchMins;
      const totalMinutes = week1Minutes + week2Minutes;

      const { data: settings } = await supabase
        .from("app_settings")
        .select("key, value")
        .in("key", ["overtime_weekly_threshold"]);

      const overtimeThreshold =
        settings?.find((s: { key: string }) => s.key === "overtime_weekly_threshold")
          ?.value || 40;

      const currentWeekNum = isSecondWeek ? 2 : 1;

      return json({
        success: true,
        staff_name: matchedStaff.name,
        is_clocked_in: matchedStaff.is_clocked_in,
        is_on_break: matchedStaff.is_on_break || false,
        pay_period_start: toESTISO(payPeriodStart),
        pay_period_end: toESTISO(payPeriodEnd),
        current_week: currentWeekNum,
        week1: {
          start: toESTISO(week1Start),
          end: toESTISO(week1End),
          logs: week1Logs,
          breaks: allBreaks.filter((b: { break_start: string }) => new Date(b.break_start) <= week1End),
          total_hours: Math.round((week1Minutes / 60) * 100) / 100,
        },
        week2: {
          start: toESTISO(week2Start),
          end: toESTISO(week2End),
          logs: week2Logs,
          breaks: allBreaks.filter((b: { break_start: string }) => new Date(b.break_start) > week1End),
          total_hours: Math.round((week2Minutes / 60) * 100) / 100,
        },
        total_hours: Math.round((totalMinutes / 60) * 100) / 100,
        overtime_threshold: Number(overtimeThreshold),
      });
    }

    // --- VERIFY PIN (legacy) ---
    if (req.method === "POST" && path === "/verify-pin") {
      const { staff_id, pin } = await req.json();

      const { data: staff, error } = await supabase
        .from("staff")
        .select("id, pin_hash, is_active")
        .eq("id", staff_id)
        .maybeSingle();

      if (error || !staff) {
        return json({ success: false, message: "Staff not found" }, 404);
      }

      if (!staff.is_active) {
        return json({ success: false, message: "Account is deactivated" }, 403);
      }

      const valid = await bcrypt.compare(pin, staff.pin_hash);
      if (!valid) {
        return json({ success: false, message: "Invalid PIN" }, 401);
      }

      return json({ success: true });
    }

    // --- CLOCK IN (legacy by staff_id) ---
    if (req.method === "POST" && path === "/clock-in") {
      const { staff_id, pin } = await req.json();

      const { data: staff } = await supabase
        .from("staff")
        .select("id, pin_hash, is_active, is_clocked_in")
        .eq("id", staff_id)
        .maybeSingle();

      if (!staff || !staff.is_active) {
        return json({ success: false, message: "Staff not found or inactive" }, 404);
      }

      const valid = await bcrypt.compare(pin, staff.pin_hash);
      if (!valid) {
        return json({ success: false, message: "Invalid PIN" }, 401);
      }

      if (staff.is_clocked_in) {
        return json({ success: false, message: "Already clocked in" }, 400);
      }

      const now = new Date();
      const weekEnding = getWeekEnding(now);

      const { error: logError } = await supabase.from("clock_logs").insert({
        staff_id,
        clock_in_time: toESTISO(now),
        week_ending: weekEnding,
      });

      if (logError) {
        return json({ success: false, message: "Failed to create clock log" }, 500);
      }

      await supabase
        .from("staff")
        .update({ is_clocked_in: true })
        .eq("id", staff_id);

      return json({
        success: true,
        timestamp: toESTISO(now),
        action: "clock_in",
      });
    }

    // --- CLOCK OUT (legacy by staff_id) ---
    if (req.method === "POST" && path === "/clock-out") {
      const { staff_id, pin } = await req.json();

      const { data: staff } = await supabase
        .from("staff")
        .select("id, pin_hash, is_active, is_clocked_in")
        .eq("id", staff_id)
        .maybeSingle();

      if (!staff || !staff.is_active) {
        return json({ success: false, message: "Staff not found or inactive" }, 404);
      }

      const valid = await bcrypt.compare(pin, staff.pin_hash);
      if (!valid) {
        return json({ success: false, message: "Invalid PIN" }, 401);
      }

      if (!staff.is_clocked_in) {
        return json({ success: false, message: "Not currently clocked in" }, 400);
      }

      const now = new Date();

      const { data: openLog } = await supabase
        .from("clock_logs")
        .select("id, clock_in_time")
        .eq("staff_id", staff_id)
        .is("clock_out_time", null)
        .order("clock_in_time", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!openLog) {
        return json({ success: false, message: "No open clock log found" }, 400);
      }

      const clockInTime = new Date(openLog.clock_in_time);
      const rawMinutes =
        Math.round((now.getTime() - clockInTime.getTime()) / 60000);
      const maxH = await getAutoClockOutHours(supabase);
      const maxM = maxH * 60;
      const durationMinutes = Math.min(rawMinutes, maxM);
      const effectiveClockOut = rawMinutes > maxM
        ? new Date(clockInTime.getTime() + maxM * 60 * 1000)
        : now;

      await supabase
        .from("clock_logs")
        .update({
          clock_out_time: toESTISO(effectiveClockOut),
          duration_minutes: durationMinutes,
        })
        .eq("id", openLog.id);

      await supabase
        .from("staff")
        .update({ is_clocked_in: false })
        .eq("id", staff_id);

      return json({
        success: true,
        timestamp: toESTISO(now),
        action: "clock_out",
        duration_minutes: durationMinutes,
      });
    }

    // --- HASH PIN ---
    if (req.method === "POST" && path === "/hash-pin") {
      const { pin } = await req.json();

      if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        return json({ success: false, message: "PIN must be exactly 4 digits" }, 400);
      }

      const hash = await bcrypt.hash(pin, 10);
      return json({ success: true, hash });
    }

    // --- REGISTER STAFF ---
    if (req.method === "POST" && path === "/register-staff") {
      const { token, name, email, phone, pin } = await req.json();

      if (email && !isValidEmail(email)) {
        return json({ success: false, message: "Invalid email format" }, 400);
      }

      if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        return json({ success: false, message: "PIN must be exactly 4 digits" }, 400);
      }

      const { data: invitation } = await supabase
        .from("invitations")
        .select("*")
        .eq("token", token)
        .eq("used", false)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (!invitation) {
        return json(
          { success: false, message: "Invalid or expired invitation" },
          400
        );
      }

      const { data: existingStaff } = await supabase
        .from("staff")
        .select("id, pin_hash")
        .eq("is_active", true);

      if (existingStaff && existingStaff.length > 0) {
        for (const staff of existingStaff) {
          const isDuplicate = await bcrypt.compare(pin, staff.pin_hash);
          if (isDuplicate) {
            return json(
              {
                success: false,
                message: "This PIN is already in use. Please choose a different PIN.",
              },
              409
            );
          }
        }
      }

      const hash = await bcrypt.hash(pin, 10);

      const staffEmail = email || invitation.email;
      const { data: newStaff, error: staffError } = await supabase
        .from("staff")
        .insert({
          name,
          email: staffEmail,
          phone: phone || "",
          pin_hash: hash,
        })
        .select()
        .maybeSingle();

      if (staffError) {
        return json({ success: false, message: staffError.message }, 400);
      }

      if (!newStaff) {
        return json({ success: false, message: "Failed to create staff record" }, 500);
      }

      await supabase
        .from("invitations")
        .update({ used: true })
        .eq("id", invitation.id);

      return json({
        success: true,
        staff: { id: newStaff.id, name: newStaff.name },
      });
    }

    // --- SEND INVITATION EMAIL ---
    if (req.method === "POST" && path === "/send-invitation") {
      const adminId = await verifyAdmin(supabase, req);
      if (!adminId) {
        return json({ success: false, message: "Admin access required" }, 403);
      }

      const { email, invitation_link } = await req.json();

      if (!email || !invitation_link) {
        return json(
          { success: false, message: "Email and invitation link required" },
          400
        );
      }

      if (!isValidEmail(email)) {
        return json({ success: false, message: "Invalid email format" }, 400);
      }

      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (!resendApiKey) {
        return json({ success: false, message: "Email service not configured" }, 500);
      }

      const emailHtml = `
        <div style="font-family: 'Quicksand', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 40px 20px;">
          <div style="background: white; border-radius: 16px; padding: 40px; border-top: 4px solid #e66d38; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #355574; font-size: 24px; margin: 0;">Moja Behavioral Services</h1>
            </div>
            <h2 style="color: #355574; font-size: 20px; margin-bottom: 16px;">You're Invited!</h2>
            <p style="color: #333; font-size: 16px; line-height: 1.6;">
              You've been invited to join the Moja Behavioral Services time tracking system. Click the button below to create your account and set up your 4-digit PIN.
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${invitation_link}" style="display: inline-block; background: #e66d38; color: white; font-size: 18px; font-weight: bold; text-decoration: none; padding: 16px 40px; border-radius: 10px;">
                Create My Account
              </a>
            </div>
            <p style="color: #666; font-size: 14px; line-height: 1.5;">
              This invitation expires in 7 days. If you didn't expect this email, you can safely ignore it.
            </p>
          </div>
        </div>
      `;

      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from:
            Deno.env.get("RESEND_FROM_EMAIL") ||
            "Moja Time Clock <onboarding@resend.dev>",
          to: [email],
          subject: "You're Invited to Moja Time Tracking",
          html: emailHtml,
        }),
      });

      if (!resendRes.ok) {
        const errBody = await resendRes.text();
        return json(
          { success: false, message: `Email send failed: ${errBody}` },
          500
        );
      }

      return json({ success: true, message: "Invitation email sent" });
    }

    // --- STAFF LIST ---
    if (req.method === "GET" && path === "/staff-list") {
      const { data: staffList } = await supabase
        .from("staff")
        .select("id, name, is_clocked_in, is_on_break, is_active")
        .eq("is_active", true)
        .order("name");

      return json({ success: true, staff: staffList || [] });
    }

    // --- ADMIN: EDIT LOG ---
    if (req.method === "POST" && path === "/admin/edit-log") {
      const adminId = await verifyAdmin(supabase, req);
      if (!adminId) {
        return json({ success: false, message: "Unauthorized" }, 401);
      }

      const { log_id, clock_in_time, clock_out_time, reason } = await req.json();

      if (!log_id || !reason) {
        return json(
          { success: false, message: "Log ID and reason are required" },
          400
        );
      }

      const { data: existing } = await supabase
        .from("clock_logs")
        .select("*")
        .eq("id", log_id)
        .maybeSingle();

      if (!existing) {
        return json({ success: false, message: "Log not found" }, 404);
      }

      const updates: Record<string, unknown> = {};
      if (clock_in_time) updates.clock_in_time = clock_in_time;
      if (clock_out_time) updates.clock_out_time = clock_out_time;

      if (updates.clock_in_time || updates.clock_out_time) {
        const inTime = new Date(
          (updates.clock_in_time as string) || existing.clock_in_time
        );
        const outTime = updates.clock_out_time
          ? new Date(updates.clock_out_time as string)
          : existing.clock_out_time
            ? new Date(existing.clock_out_time)
            : null;
        if (outTime) {
          updates.duration_minutes =
            Math.round((outTime.getTime() - inTime.getTime()) / 60000);
        }
      }

      if (reason) {
        const noteTimestamp = nowEST().replace("T", " ").slice(0, 16);
        const newNote = `[${noteTimestamp}] ${reason}`;
        updates.notes = existing.notes ? `${existing.notes}\n${newNote}` : newNote;
      }

      await supabase.from("clock_logs").update(updates).eq("id", log_id);

      await supabase.from("audit_log").insert({
        admin_id: adminId,
        action: "manual_edit",
        target_staff_id: existing.staff_id,
        clock_log_id: log_id,
        old_values: existing,
        new_values: updates,
        reason,
      });

      return json({ success: true, message: "Log updated" });
    }

    // --- ADMIN: ADD LOG ---
    if (req.method === "POST" && path === "/admin/add-log") {
      const adminId = await verifyAdmin(supabase, req);
      if (!adminId) {
        return json({ success: false, message: "Unauthorized" }, 401);
      }

      const { staff_id, clock_in_time, clock_out_time, reason } = await req.json();

      if (!staff_id || !clock_in_time || !reason) {
        return json(
          {
            success: false,
            message: "Staff ID, clock in time, and reason are required",
          },
          400
        );
      }

      const inTime = new Date(clock_in_time);
      const outTime = clock_out_time ? new Date(clock_out_time) : null;
      const durationMinutes = outTime
        ? Math.round((outTime.getTime() - inTime.getTime()) / 60000)
        : null;
      const weekEnding = getWeekEnding(inTime);

      const { data: newLog, error } = await supabase
        .from("clock_logs")
        .insert({
          staff_id,
          clock_in_time: toESTISO(inTime),
          clock_out_time: outTime ? toESTISO(outTime) : null,
          duration_minutes: durationMinutes,
          week_ending: weekEnding,
          notes: `[${nowEST().replace("T", " ").slice(0, 16)}] ${reason}`,
        })
        .select()
        .maybeSingle();

      if (error) {
        return json({ success: false, message: error.message }, 500);
      }

      await supabase.from("audit_log").insert({
        admin_id: adminId,
        action: "manual_add",
        target_staff_id: staff_id,
        clock_log_id: newLog?.id,
        new_values: { clock_in_time, clock_out_time, duration_minutes: durationMinutes },
        reason,
      });

      return json({ success: true, message: "Log entry added", log: newLog });
    }

    // --- ADMIN: DELETE LOG ---
    if (req.method === "POST" && path === "/admin/delete-log") {
      const adminId = await verifyAdmin(supabase, req);
      if (!adminId) {
        return json({ success: false, message: "Unauthorized" }, 401);
      }

      const { log_id, reason } = await req.json();

      if (!log_id || !reason) {
        return json(
          { success: false, message: "Log ID and reason are required" },
          400
        );
      }

      const { data: existing } = await supabase
        .from("clock_logs")
        .select("*")
        .eq("id", log_id)
        .maybeSingle();

      if (!existing) {
        return json({ success: false, message: "Log not found" }, 404);
      }

      await supabase.from("audit_log").insert({
        admin_id: adminId,
        action: "manual_delete",
        target_staff_id: existing.staff_id,
        clock_log_id: log_id,
        old_values: existing,
        reason,
      });

      await supabase.from("break_logs").delete().eq("clock_log_id", log_id);
      await supabase.from("clock_logs").delete().eq("id", log_id);

      return json({ success: true, message: "Log entry deleted" });
    }

    // --- ADMIN: FORCE CLOCK OUT ALL ---
    if (req.method === "POST" && path === "/admin/force-clock-out-all") {
      const adminId = await verifyAdmin(supabase, req);
      if (!adminId) {
        return json({ success: false, message: "Unauthorized" }, 401);
      }

      const { reason } = await req.json();

      const { data: clockedInStaff } = await supabase
        .from("staff")
        .select("id, name")
        .eq("is_clocked_in", true);

      if (!clockedInStaff || clockedInStaff.length === 0) {
        return json({ success: true, message: "No staff currently clocked in", count: 0 });
      }

      const now = new Date();
      let count = 0;

      for (const staff of clockedInStaff) {
        const { data: openLog } = await supabase
          .from("clock_logs")
          .select("id, clock_in_time, notes")
          .eq("staff_id", staff.id)
          .is("clock_out_time", null)
          .order("clock_in_time", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (openLog) {
          // End any open breaks
          const { data: openBreak } = await supabase
            .from("break_logs")
            .select("id, break_start")
            .eq("staff_id", staff.id)
            .is("break_end", null)
            .maybeSingle();

          if (openBreak) {
            const breakDuration = Math.round(
              (now.getTime() - new Date(openBreak.break_start).getTime()) / 60000
            );
            await supabase
              .from("break_logs")
              .update({
                break_end: toESTISO(now),
                duration_minutes: breakDuration,
              })
              .eq("id", openBreak.id);
          }

          const clockInTime = new Date(openLog.clock_in_time);
          const durationMinutes =
            Math.round((now.getTime() - clockInTime.getTime()) / 60000);

          await supabase
            .from("clock_logs")
            .update({
              clock_out_time: toESTISO(now),
              duration_minutes: durationMinutes,
              notes: (() => {
                const newNote = `[${toESTISO(now).replace("T", " ").slice(0, 16)}] ${reason || "Force clock out by admin"}`;
                return openLog.notes ? `${openLog.notes}\n${newNote}` : newNote;
              })(),
            })
            .eq("id", openLog.id);

          await supabase.from("audit_log").insert({
            admin_id: adminId,
            action: "force_clock_out",
            target_staff_id: staff.id,
            clock_log_id: openLog.id,
            new_values: { clock_out_time: toESTISO(now), duration_minutes: durationMinutes },
            reason: reason || "Force clock out all",
          });

          count++;
        }

        await supabase
          .from("staff")
          .update({ is_clocked_in: false, is_on_break: false })
          .eq("id", staff.id);
      }

      return json({
        success: true,
        message: `Clocked out ${count} staff member(s)`,
        count,
      });
    }

    // --- ADMIN: GET SETTINGS ---
    if (req.method === "GET" && path === "/admin/settings") {
      const adminId = await verifyAdmin(supabase, req);
      if (!adminId) {
        return json({ success: false, message: "Unauthorized" }, 401);
      }

      const { data: settings } = await supabase
        .from("app_settings")
        .select("key, value");

      const settingsMap: Record<string, unknown> = {};
      (settings || []).forEach(
        (s: { key: string; value: unknown }) => (settingsMap[s.key] = s.value)
      );

      return json({ success: true, settings: settingsMap });
    }

    // --- ADMIN: UPDATE SETTINGS ---
    if (req.method === "POST" && path === "/admin/settings") {
      const adminId = await verifyAdmin(supabase, req);
      if (!adminId) {
        return json({ success: false, message: "Unauthorized" }, 401);
      }

      const { settings } = await req.json();

      if (!settings || typeof settings !== "object") {
        return json({ success: false, message: "Settings object required" }, 400);
      }

      for (const [key, value] of Object.entries(settings)) {
        await supabase
          .from("app_settings")
          .upsert(
            { key, value: JSON.parse(JSON.stringify(value)), updated_at: nowEST() },
            { onConflict: "key" }
          );
      }

      return json({ success: true, message: "Settings updated" });
    }

    // --- ADMIN: GET AUDIT LOG ---
    if (req.method === "GET" && path === "/admin/audit-log") {
      const adminId = await verifyAdmin(supabase, req);
      if (!adminId) {
        return json({ success: false, message: "Unauthorized" }, 401);
      }

      const { data: logs } = await supabase
        .from("audit_log")
        .select("*, admins(name), staff:target_staff_id(name)")
        .order("created_at", { ascending: false })
        .limit(100);

      return json({ success: true, logs: logs || [] });
    }

    // --- REQUEST PASSWORD RESET ---
    if (req.method === "POST" && path === "/request-password-reset") {
      const { email, app_url } = await req.json();

      if (!email) {
        return json({ success: false, message: "Email is required" }, 400);
      }

      if (!isValidEmail(email)) {
        return json({ success: false, message: "Invalid email format" }, 400);
      }

      const { data: adminUser } = await supabase.auth.admin.listUsers();
      const userExists = adminUser?.users?.some(
        (u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase()
      );

      if (!userExists) {
        return json({
          success: true,
          message: "If an account exists, a reset link has been sent",
        });
      }

      const token = crypto.randomUUID();
      const expiresAt = toESTISO(new Date(Date.now() + 60 * 60 * 1000));

      const { error: tokenError } = await supabase
        .from("password_reset_tokens")
        .insert({ email: email.toLowerCase(), token, expires_at: expiresAt });

      if (tokenError) {
        return json({ success: false, message: "Failed to create reset token" }, 500);
      }

      const baseUrl = app_url.endsWith("/") ? app_url : `${app_url}/`;
      const resetLink = `${baseUrl}#/admin/reset-password?token=${token}`;

      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (!resendApiKey) {
        return json({ success: false, message: "Email service not configured" }, 500);
      }

      const emailHtml = `
        <div style="font-family: 'Quicksand', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 40px 20px;">
          <div style="background: white; border-radius: 16px; padding: 40px; border-top: 4px solid #e66d38; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
            <h1 style="color: #355574; font-size: 24px; text-align:center;">Moja Behavioral Services</h1>
            <h2 style="color: #355574; font-size: 20px; margin-bottom: 16px;">Password Reset Request</h2>
            <p style="color: #333; font-size: 16px; line-height: 1.6;">
              We received a request to reset your admin password. Click the button below to choose a new password.
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${resetLink}" style="display: inline-block; background: #e66d38; color: white; font-size: 18px; font-weight: bold; text-decoration: none; padding: 16px 40px; border-radius: 10px;">
                Reset My Password
              </a>
            </div>
            <p style="color: #666; font-size: 14px;">This link expires in 1 hour.</p>
          </div>
        </div>
      `;

      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from:
            Deno.env.get("RESEND_FROM_EMAIL") ||
            "Moja Time Clock <onboarding@resend.dev>",
          to: [email],
          subject: "Reset Your Moja Admin Password",
          html: emailHtml,
        }),
      });

      if (!resendRes.ok) {
        const errBody = await resendRes.text();
        return json({ success: false, message: `Email send failed: ${errBody}` }, 500);
      }

      return json({
        success: true,
        message: "If an account exists, a reset link has been sent",
      });
    }

    // --- RESET PASSWORD ---
    if (req.method === "POST" && path === "/reset-password") {
      const { token, new_password } = await req.json();

      if (!token || !new_password) {
        return json(
          { success: false, message: "Token and new password are required" },
          400
        );
      }

      if (new_password.length < 6) {
        return json(
          { success: false, message: "Password must be at least 6 characters" },
          400
        );
      }

      if (await isPasswordLeaked(new_password)) {
        return json({ success: false, message: "This password has appeared in a data breach. Please choose a different password." }, 400);
      }

      const { data: resetToken } = await supabase
        .from("password_reset_tokens")
        .select("*")
        .eq("token", token)
        .eq("used", false)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (!resetToken) {
        return json(
          {
            success: false,
            message: "Invalid or expired reset link. Please request a new one.",
          },
          400
        );
      }

      const { data: adminUsers } = await supabase.auth.admin.listUsers();
      const targetUser = adminUsers?.users?.find(
        (u: { email?: string }) =>
          u.email?.toLowerCase() === resetToken.email.toLowerCase()
      );

      if (!targetUser) {
        return json({ success: false, message: "User not found" }, 404);
      }

      const { error: updateError } = await supabase.auth.admin.updateUserById(
        targetUser.id,
        { password: new_password }
      );

      if (updateError) {
        return json({ success: false, message: updateError.message }, 500);
      }

      await supabase
        .from("password_reset_tokens")
        .update({ used: true })
        .eq("id", resetToken.id);

      return json({ success: true, message: "Password updated successfully" });
    }

    // --- AUTO CLOCK-OUT CRON (closes stale shifts exceeding max hours) ---
    if (req.method === "POST" && path === "/auto-clock-out") {
      const maxHours = await getAutoClockOutHours(supabase);
      const closed = await autoCloseStaleShifts(supabase, maxHours);
      return json({ success: true, message: `Auto-closed ${closed} stale shift(s)`, closed, max_hours: maxHours });
    }

    return json({ success: false, message: "Not found" }, 404);
  } catch (err) {
    console.error("Edge function error:", err);
    return json({ success: false, message: "An unexpected error occurred. Please try again." }, 500);
  }
});
