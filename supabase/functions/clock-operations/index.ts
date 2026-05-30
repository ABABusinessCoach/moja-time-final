import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import * as bcrypt from "npm:bcryptjs@2.4.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function getWeekEnding(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? 0 : 7 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
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

    if (req.method === "POST" && path === "/verify-pin") {
      const { staff_id, pin } = await req.json();

      const { data: staff, error } = await supabase
        .from("staff")
        .select("id, pin_hash, is_active")
        .eq("id", staff_id)
        .maybeSingle();

      if (error || !staff) {
        return new Response(
          JSON.stringify({ success: false, message: "Staff not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!staff.is_active) {
        return new Response(
          JSON.stringify({ success: false, message: "Account is deactivated" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const valid = await bcrypt.compare(pin, staff.pin_hash);
      if (!valid) {
        return new Response(
          JSON.stringify({ success: false, message: "Invalid PIN" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "POST" && path === "/clock-in") {
      const { staff_id, pin } = await req.json();

      const { data: staff } = await supabase
        .from("staff")
        .select("id, pin_hash, is_active, is_clocked_in")
        .eq("id", staff_id)
        .maybeSingle();

      if (!staff || !staff.is_active) {
        return new Response(
          JSON.stringify({ success: false, message: "Staff not found or inactive" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const valid = await bcrypt.compare(pin, staff.pin_hash);
      if (!valid) {
        return new Response(
          JSON.stringify({ success: false, message: "Invalid PIN" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (staff.is_clocked_in) {
        return new Response(
          JSON.stringify({ success: false, message: "Already clocked in" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const now = new Date();
      const weekEnding = getWeekEnding(now);

      const { error: logError } = await supabase.from("clock_logs").insert({
        staff_id,
        clock_in_time: now.toISOString(),
        week_ending: weekEnding,
      });

      if (logError) {
        return new Response(
          JSON.stringify({ success: false, message: "Failed to create clock log" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await supabase
        .from("staff")
        .update({ is_clocked_in: true })
        .eq("id", staff_id);

      return new Response(
        JSON.stringify({ success: true, timestamp: now.toISOString(), action: "clock_in" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "POST" && path === "/clock-out") {
      const { staff_id, pin } = await req.json();

      const { data: staff } = await supabase
        .from("staff")
        .select("id, pin_hash, is_active, is_clocked_in")
        .eq("id", staff_id)
        .maybeSingle();

      if (!staff || !staff.is_active) {
        return new Response(
          JSON.stringify({ success: false, message: "Staff not found or inactive" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const valid = await bcrypt.compare(pin, staff.pin_hash);
      if (!valid) {
        return new Response(
          JSON.stringify({ success: false, message: "Invalid PIN" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!staff.is_clocked_in) {
        return new Response(
          JSON.stringify({ success: false, message: "Not currently clocked in" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
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
        return new Response(
          JSON.stringify({ success: false, message: "No open clock log found" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const clockInTime = new Date(openLog.clock_in_time);
      const durationMinutes = Math.round(
        (now.getTime() - clockInTime.getTime()) / 60000
      );

      await supabase
        .from("clock_logs")
        .update({
          clock_out_time: now.toISOString(),
          duration_minutes: durationMinutes,
        })
        .eq("id", openLog.id);

      await supabase
        .from("staff")
        .update({ is_clocked_in: false })
        .eq("id", staff_id);

      return new Response(
        JSON.stringify({
          success: true,
          timestamp: now.toISOString(),
          action: "clock_out",
          duration_minutes: durationMinutes,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "POST" && path === "/hash-pin") {
      const { pin } = await req.json();

      if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        return new Response(
          JSON.stringify({ success: false, message: "PIN must be exactly 4 digits" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const hash = await bcrypt.hash(pin, 10);

      return new Response(
        JSON.stringify({ success: true, hash }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "POST" && path === "/lookup-pin") {
      const { pin } = await req.json();

      if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        return new Response(
          JSON.stringify({ success: false, message: "PIN must be exactly 4 digits" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: activeStaff } = await supabase
        .from("staff")
        .select("id, name, pin_hash, is_clocked_in")
        .eq("is_active", true);

      if (!activeStaff || activeStaff.length === 0) {
        return new Response(
          JSON.stringify({ success: false, message: "No staff found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
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
        return new Response(
          JSON.stringify({ success: false, message: "Invalid PIN" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, staff_name: matchedStaff.name, is_clocked_in: matchedStaff.is_clocked_in }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "POST" && path === "/register-staff") {
      const { token, name, email, phone, pin } = await req.json();

      if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        return new Response(
          JSON.stringify({ success: false, message: "PIN must be exactly 4 digits" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: invitation } = await supabase
        .from("invitations")
        .select("*")
        .eq("token", token)
        .eq("used", false)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (!invitation) {
        return new Response(
          JSON.stringify({ success: false, message: "Invalid or expired invitation" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check for duplicate PIN across all active staff
      const { data: existingStaff } = await supabase
        .from("staff")
        .select("id, pin_hash")
        .eq("is_active", true);

      if (existingStaff && existingStaff.length > 0) {
        for (const staff of existingStaff) {
          const isDuplicate = await bcrypt.compare(pin, staff.pin_hash);
          if (isDuplicate) {
            return new Response(
              JSON.stringify({ success: false, message: "This PIN is already in use. Please choose a different PIN." }),
              { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }

      const hash = await bcrypt.hash(pin, 10);

      const { data: newStaff, error: staffError } = await supabase
        .from("staff")
        .insert({
          name,
          email: email || invitation.email,
          phone: phone || "",
          pin_hash: hash,
        })
        .select()
        .maybeSingle();

      if (staffError) {
        return new Response(
          JSON.stringify({ success: false, message: staffError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await supabase
        .from("invitations")
        .update({ used: true })
        .eq("id", invitation.id);

      return new Response(
        JSON.stringify({ success: true, staff: { id: newStaff.id, name: newStaff.name } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "POST" && path === "/send-invitation") {
      const { email, invitation_link } = await req.json();

      if (!email || !invitation_link) {
        return new Response(
          JSON.stringify({ success: false, message: "Email and invitation link required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (!resendApiKey) {
        return new Response(
          JSON.stringify({ success: false, message: "Email service not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const emailHtml = `
        <div style="font-family: 'Quicksand', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 40px 20px;">
          <div style="background: white; border-radius: 16px; padding: 40px; border-top: 4px solid #e66d38; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #355574; font-size: 24px; margin: 0;">Moja Behavioral Services</h1>
              <div style="margin-top: 8px;">
                <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #e66d38; margin: 0 3px;"></span>
                <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #6dccc2; margin: 0 3px;"></span>
                <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #efd35c; margin: 0 3px;"></span>
              </div>
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
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
            <p style="color: #999; font-size: 12px; text-align: center;">
              Moja Behavioral Services - Staff Time Tracking
            </p>
          </div>
        </div>
      `;

      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: Deno.env.get("RESEND_FROM_EMAIL") || "Moja Time Clock <onboarding@resend.dev>",
          to: [email],
          subject: "You're Invited to Moja Time Tracking",
          html: emailHtml,
        }),
      });

      if (!resendRes.ok) {
        const errBody = await resendRes.text();
        return new Response(
          JSON.stringify({ success: false, message: `Email send failed: ${errBody}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: "Invitation email sent" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "POST" && path === "/clock-in-by-pin") {
      const { pin } = await req.json();

      if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        return new Response(
          JSON.stringify({ success: false, message: "PIN must be exactly 4 digits" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: activeStaff } = await supabase
        .from("staff")
        .select("id, name, pin_hash, is_clocked_in, is_active")
        .eq("is_active", true);

      if (!activeStaff || activeStaff.length === 0) {
        return new Response(
          JSON.stringify({ success: false, message: "No active staff found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
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
        return new Response(
          JSON.stringify({ success: false, message: "Invalid PIN" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (matchedStaff.is_clocked_in) {
        return new Response(
          JSON.stringify({ success: false, message: `${matchedStaff.name} is already clocked in` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const now = new Date();
      const weekEnding = getWeekEnding(now);

      const { error: logError } = await supabase.from("clock_logs").insert({
        staff_id: matchedStaff.id,
        clock_in_time: now.toISOString(),
        week_ending: weekEnding,
      });

      if (logError) {
        return new Response(
          JSON.stringify({ success: false, message: "Failed to create clock log" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await supabase
        .from("staff")
        .update({ is_clocked_in: true })
        .eq("id", matchedStaff.id);

      return new Response(
        JSON.stringify({ success: true, timestamp: now.toISOString(), action: "clock_in", staff_name: matchedStaff.name }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "POST" && path === "/clock-out-by-pin") {
      const { pin } = await req.json();

      if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        return new Response(
          JSON.stringify({ success: false, message: "PIN must be exactly 4 digits" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: activeStaff } = await supabase
        .from("staff")
        .select("id, name, pin_hash, is_clocked_in, is_active")
        .eq("is_active", true);

      if (!activeStaff || activeStaff.length === 0) {
        return new Response(
          JSON.stringify({ success: false, message: "No active staff found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
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
        return new Response(
          JSON.stringify({ success: false, message: "Invalid PIN" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!matchedStaff.is_clocked_in) {
        return new Response(
          JSON.stringify({ success: false, message: `${matchedStaff.name} is not clocked in` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const now = new Date();

      const { data: openLog } = await supabase
        .from("clock_logs")
        .select("id, clock_in_time")
        .eq("staff_id", matchedStaff.id)
        .is("clock_out_time", null)
        .order("clock_in_time", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!openLog) {
        return new Response(
          JSON.stringify({ success: false, message: "No open clock log found" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const clockInTime = new Date(openLog.clock_in_time);
      const durationMinutes = Math.round(
        (now.getTime() - clockInTime.getTime()) / 60000
      );

      await supabase
        .from("clock_logs")
        .update({
          clock_out_time: now.toISOString(),
          duration_minutes: durationMinutes,
        })
        .eq("id", openLog.id);

      await supabase
        .from("staff")
        .update({ is_clocked_in: false })
        .eq("id", matchedStaff.id);

      return new Response(
        JSON.stringify({
          success: true,
          timestamp: now.toISOString(),
          action: "clock_out",
          staff_name: matchedStaff.name,
          duration_minutes: durationMinutes,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "GET" && path === "/staff-list") {
      const { data: staffList } = await supabase
        .from("staff")
        .select("id, name, is_clocked_in, is_active")
        .eq("is_active", true)
        .order("name");

      return new Response(
        JSON.stringify({ success: true, staff: staffList || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, message: "Not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, message: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
