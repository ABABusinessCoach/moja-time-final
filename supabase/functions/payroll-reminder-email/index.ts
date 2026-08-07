import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const isTest = body.test === true;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get active reminders
    const { data: reminders, error: remErr } = await supabase
      .from("payroll_reminders")
      .select("*")
      .eq("is_active", true);

    if (remErr) throw new Error(`Failed to fetch reminders: ${remErr.message}`);
    if (!reminders || reminders.length === 0) {
      return json({ message: "No active reminders" });
    }

    // Check which reminders are due today (or all if test mode)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);

    let dueReminders;
    if (isTest) {
      dueReminders = reminders;
    } else {
      dueReminders = reminders.filter((r) => {
        const first = new Date(r.first_due_date + "T00:00:00");
        const msPerCycle = r.recurrence_weeks * 7 * 86400000;

        if (todayStr === r.first_due_date) return true;
        if (today < first) return false;

        const elapsed = today.getTime() - first.getTime();
        const cycles = Math.round(elapsed / msPerCycle);
        const expectedDate = new Date(first.getTime() + cycles * msPerCycle);
        return expectedDate.toISOString().slice(0, 10) === todayStr;
      });
    }

    if (dueReminders.length === 0) {
      return json({ message: "No reminders due today" });
    }

    // Get admin emails
    const { data: admins, error: adminErr } = await supabase
      .from("admins")
      .select("email, name");

    if (adminErr) throw new Error(`Failed to fetch admins: ${adminErr.message}`);
    if (!admins || admins.length === 0) {
      return json({ message: "No admins to notify" });
    }

    const results: { reminder: string; emailsSent: number; errors: string[] }[] = [];

    for (const reminder of dueReminders) {
      const descriptionItems = (reminder.description || "")
        .split("\n")
        .filter(Boolean)
        .map((line: string) => `<li style="margin-bottom:6px;color:#374151;">${line}</li>`)
        .join("");

      const dueDate = new Date(todayStr + "T00:00:00");
      const formattedDate = dueDate.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });

      let emailsSent = 0;
      const errors: string[] = [];

      for (const admin of admins) {
        const htmlBody = `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
            <div style="background:#1e3a5f;border-radius:8px 8px 0 0;padding:24px 32px;">
              <h1 style="color:#ffffff;margin:0;font-size:22px;">Payroll Reminder</h1>
            </div>
            <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:32px;">
              <p style="color:#374151;font-size:16px;margin-top:0;">Hi ${admin.name || "Admin"},</p>
              <h2 style="color:#1e3a5f;font-size:18px;margin-bottom:8px;">${reminder.title}</h2>
              <p style="color:#6b7280;font-size:14px;margin-bottom:16px;">
                Due: <strong>${formattedDate}</strong> &middot; ${reminder.due_time}
              </p>
              <div style="background:#f9fafb;border-radius:6px;padding:16px 20px;margin-bottom:24px;">
                <p style="color:#374151;font-weight:600;margin:0 0 8px 0;font-size:14px;">Action Items:</p>
                <ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.6;">
                  ${descriptionItems}
                </ul>
              </div>
              <p style="color:#6b7280;font-size:13px;margin-bottom:0;">
                This is an automated reminder. Please complete these tasks by end of day.
              </p>
            </div>
          </div>
        `;

        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Moja Time <reminders@mojakids.com>",
            to: [admin.email],
            subject: `Payroll Reminder: ${reminder.title} — Due ${formattedDate}`,
            html: htmlBody,
          }),
        });

        if (res.ok) {
          emailsSent++;
        } else {
          const errBody = await res.text();
          errors.push(`${admin.email}: ${errBody}`);
        }
      }

      results.push({ reminder: reminder.title, emailsSent, errors });
    }

    return json({ success: true, results });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
