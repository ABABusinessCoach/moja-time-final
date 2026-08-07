import { CheckCircle, Clock, AlertTriangle, MessageSquare, Printer } from 'lucide-react';

export function PayrollApprovalSOP() {
  return (
    <div className="max-w-4xl mx-auto">
      {/* Print button */}
      <div className="flex justify-end mb-4 print:hidden">
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-moja-blue/60 hover:text-moja-blue bg-white border-2 border-gray-200 hover:border-moja-blue/30 rounded-lg transition-all"
        >
          <Printer className="w-4 h-4" />
          Print / Save as PDF
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden print:shadow-none print:border-none">
        {/* Header */}
        <div className="bg-gradient-to-r from-moja-blue to-moja-blue/90 px-8 py-8 print:py-6">
          <p className="text-moja-orange text-xs font-bold tracking-widest uppercase mb-2">Admin Guide</p>
          <h1 className="text-2xl font-bold text-white">How to Review & Approve Payroll</h1>
          <p className="text-white/60 text-sm mt-1">Standard Operating Procedure — Moja Behavioral Services</p>
        </div>

        <div className="px-8 py-8 space-y-10 print:px-0">
          {/* Flow overview */}
          <div className="flex flex-wrap items-center justify-center gap-2 py-4 bg-gray-50 rounded-xl">
            {['Log In', 'Open Timecards', 'Select Employee', 'Handle Notes & Corrections', 'Approve & Send'].map((step, i) => (
              <span key={step} className="flex items-center gap-2">
                {i > 0 && <span className="text-gray-300 text-lg">&rarr;</span>}
                <span className={`inline-block px-3 py-1.5 text-xs font-bold rounded-lg ${
                  i === 3 ? 'bg-amber-100 text-amber-700' :
                  i === 4 ? 'bg-green-100 text-green-700' :
                  'bg-white text-moja-blue border border-gray-200'
                }`}>
                  {step}
                </span>
              </span>
            ))}
          </div>

          {/* Key rule */}
          <div className="bg-red-50 border-l-4 border-red-500 rounded-r-xl p-4">
            <p className="text-sm font-bold text-red-800">Key Rule</p>
            <p className="text-sm text-red-700 mt-1">
              Every employee must be individually reviewed and approved — even if they have no correction requests, no open notes, and their hours look perfect. <strong>Do not skip anyone.</strong> No timecard should be left in "Pending" or "Employee Approved" status when payroll is submitted.
            </p>
          </div>

          {/* When to run */}
          <Section title="When to Run Payroll Approval">
            <div className="grid sm:grid-cols-2 gap-3">
              <InfoRow label="Pay Period" value="Every 2 weeks, Saturday through Friday" />
              <InfoRow label="Timecards Sent" value="Last Friday of each pay period at 3:00 PM" />
              <InfoRow label="Employee Deadline" value="8:00 PM EST the same day" />
              <InfoRow label="Admin Approval Window" value="After employee deadline through Monday EOD" />
              <InfoRow label="Reminder Email" value="Automated email to all admins every other Monday at 9:00 AM" />
            </div>
            <Tip>You will receive an automated reminder email on payroll Mondays with a checklist. Use it as your cue to begin the approval process if you have not already started.</Tip>
          </Section>

          {/* Step by step */}
          <Section title="Step-by-Step Instructions">
            <div className="space-y-4">
              <Step n={1} title="Log In to the Admin Dashboard">
                <p>Open the Moja Time app in your browser and sign in with your admin email and password. If you have trouble logging in, use the "Reset Password" link on the login page.</p>
              </Step>

              <Step n={2} title='Navigate to "Timecards"'>
                <p>From the tabs at the top, click <strong>"Timecards"</strong>. You will land on this page. At the top you will see a count badge showing how many timecards still need review.</p>
              </Step>

              <Step n={3} title="Confirm the Correct Pay Period">
                <p>Use the pay period dropdown to make sure you are looking at the correct 2-week period. The current period is selected by default.</p>
                <p className="mt-2">The <strong>"Needs Review"</strong> tab shows timecards that have not been admin-approved yet. The <strong>"Approved"</strong> tab shows ones you have already finished.</p>
              </Step>

              <div className="bg-blue-50 border-l-4 border-moja-blue rounded-r-xl p-4">
                <p className="text-sm text-blue-800"><strong>Goal:</strong> By the time you are done, every employee should appear under the "Approved" tab with zero remaining in "Needs Review."</p>
              </div>

              <Step n={4} title="Open the First Employee's Timecard">
                <p>Click on any employee's name in the list. You will see their full 2-week timecard with:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1 text-sm text-gray-600">
                  <li><strong>Week 1 and Week 2 grids</strong> — showing regular hours, overtime, and daily totals</li>
                  <li><strong>Period totals</strong> — regular hours, overtime hours, and grand total at the bottom</li>
                  <li><strong>Status badge</strong> — showing Pending, Employee Approved, Has Notes, or Approved</li>
                </ul>
              </Step>
            </div>
          </Section>

          {/* Status badges */}
          <Section title="Understanding the Status Badges">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-moja-blue text-white text-left">
                    <th className="px-4 py-3 rounded-tl-lg font-bold">Status</th>
                    <th className="px-4 py-3 font-bold">What It Means</th>
                    <th className="px-4 py-3 rounded-tr-lg font-bold">Action Required</th>
                  </tr>
                </thead>
                <tbody>
                  <StatusRow
                    icon={<Clock className="w-4 h-4 text-blue-600" />}
                    badge="Pending" badgeClass="bg-blue-100 text-blue-700"
                    meaning="Employee has not reviewed their timecard yet"
                    action="Review the hours yourself, then approve"
                  />
                  <StatusRow
                    icon={<CheckCircle className="w-4 h-4 text-emerald-600" />}
                    badge="Employee Approved" badgeClass="bg-emerald-100 text-emerald-700"
                    meaning="Employee reviewed and confirmed their hours are correct"
                    action="Verify and approve"
                  />
                  <StatusRow
                    icon={<MessageSquare className="w-4 h-4 text-amber-600" />}
                    badge="Has Notes" badgeClass="bg-amber-100 text-amber-700"
                    meaning="Employee submitted notes or correction requests"
                    action="Handle each note/correction, then approve"
                  />
                  <StatusRow
                    icon={<CheckCircle className="w-4 h-4 text-green-600" />}
                    badge="Approved" badgeClass="bg-green-100 text-green-700"
                    meaning="You have already approved this timecard"
                    action="None — this one is done"
                  />
                </tbody>
              </table>
            </div>
          </Section>

          {/* Reviewing & Approving */}
          <Section title="Reviewing & Approving">
            <div className="space-y-4">
              <Step n={5} title="Review the Hours">
                <p>Look at each day in the grid. Verify that the hours look reasonable for that employee's expected schedule.</p>
                <p className="mt-2 font-semibold text-gray-700">Things to watch for:</p>
                <ul className="list-disc pl-5 mt-1 space-y-1 text-sm text-gray-600">
                  <li>Unusually long or short shifts</li>
                  <li>Days that should have a shift but show 0h 00m</li>
                  <li>Days showing hours when the employee was not scheduled</li>
                  <li>Overtime that was not pre-approved</li>
                  <li>A <strong>"LIVE"</strong> indicator — the employee is currently clocked in</li>
                </ul>
              </Step>

              <Tip>
                <strong>Editing a shift:</strong> Click on any day in the grid. A pop-up will appear where you can adjust the clock-in time, clock-out time, break times, and lunch times. Click <strong>"Save Override"</strong> when done. The totals will recalculate automatically.
              </Tip>

              <div className="bg-blue-50 border-l-4 border-moja-blue rounded-r-xl p-4">
                <p className="text-sm text-blue-800"><strong>Adding a missing shift:</strong> If an employee worked a day that shows no hours, click on that empty day in the grid. A pop-up will appear where you can enter the times. Click <strong>"Add Hours"</strong> to save it.</p>
              </div>

              <Step n={6} title="Handle Correction Requests (If Any)">
                <p>If the employee submitted a correction request, you will see a yellow banner below the week grid showing what they are requesting.</p>
                <p className="mt-2">For each correction request:</p>
                <ul className="list-disc pl-5 mt-1 space-y-1 text-sm text-gray-600">
                  <li>Read the employee's note explaining the change</li>
                  <li>Click <strong>"Approve"</strong> if the correction is valid — the hours will update automatically</li>
                  <li>Click <strong>"Reject"</strong> if it is not valid — you can optionally provide a reason</li>
                </ul>
                <p className="mt-2 text-sm text-red-600 font-semibold">You must handle every pending correction before approving the timecard.</p>
              </Step>

              <Step n={7} title="Respond to Open Notes (If Any)">
                <p>If the employee left general notes or questions, you will see an "Open Notes" section below the timecard grid.</p>
                <ul className="list-disc pl-5 mt-2 space-y-1 text-sm text-gray-600">
                  <li><strong>Resolve</strong> — if you have addressed the issue (add a resolution comment if helpful)</li>
                  <li><strong>Dismiss</strong> — if the note does not require action</li>
                </ul>
              </Step>

              <Step n={8} title="Approve & Send Final Hours">
                <p>Once you have verified the hours and handled all notes and corrections, scroll to the bottom. Click the green <strong>"Approve & Send Email"</strong> button.</p>
                <p className="mt-2">This does two things:</p>
                <ol className="list-decimal pl-5 mt-1 space-y-1 text-sm text-gray-600">
                  <li>Locks the timecard as <strong>Approved</strong> — no further changes can be made</li>
                  <li>Sends a <strong>confirmation email</strong> to the employee with their finalized hours</li>
                </ol>
              </Step>

              <div className="bg-green-50 border-l-4 border-green-500 rounded-r-xl p-4">
                <p className="text-sm text-green-800"><strong>Confirmation:</strong> After clicking approve, you will see a green banner confirming the timecard is fully approved and the email has been sent. You can now click <strong>"Back"</strong> and move to the next employee.</p>
              </div>

              <Step n={9} title="Repeat for Every Employee">
                <p>Click <strong>"Back"</strong> to return to the list. Open the next employee and repeat Steps 5 through 8.</p>
                <p className="mt-2 font-bold text-gray-800">Continue until the "Needs Review" count reaches zero and every employee is under the "Approved" tab.</p>
              </Step>
            </div>
          </Section>

          {/* Do not skip reminder */}
          <div className="bg-red-50 border-l-4 border-red-500 rounded-r-xl p-4">
            <p className="text-sm text-red-700">
              <strong>Do not skip anyone.</strong> Even if an employee's hours look perfect and they have no corrections or notes, you must still click into their timecard and click <strong>"Approve & Send Email"</strong>. Unapproved timecards will not be included in the final payroll count.
            </p>
          </div>

          {/* Sending Timecards */}
          <Section title="Sending Timecards to Employees">
            <p className="text-sm text-gray-600 mb-4">Before you can approve timecards, employees need to receive them. This is typically done automatically at the end of each pay period, but you can also send or re-send timecards manually.</p>
            <div className="space-y-4">
              <Step n="A" title='Click "Send Timecards"'>
                <p>Click the orange <strong>"Send Timecards"</strong> button in the top-right corner of the Timecard Reports page.</p>
              </Step>
              <Step n="B" title="Select Pay Period and Staff">
                <p>Choose the pay period from the dropdown. By default, all active employees are selected. You can deselect individuals if needed.</p>
                <p className="mt-2">Check the <strong>"Re-send existing timecards"</strong> box if you want to regenerate and re-email timecards for employees who already received one (useful if hours have changed since the original send).</p>
              </Step>
              <Step n="C" title='Click "Send"'>
                <p>Click the <strong>"Send to X Staff"</strong> button. Each selected employee will receive an email with a link to review their timecard.</p>
              </Step>
            </div>
          </Section>

          {/* Completion checklist */}
          <Section title="Payroll Approval Completion Checklist">
            <p className="text-sm text-gray-600 mb-4">Use this checklist each pay period to confirm you have completed everything:</p>
            <div className="space-y-3">
              {[
                'Timecards have been sent to all active employees',
                'All correction requests have been approved or rejected',
                'All open employee notes have been resolved or dismissed',
                'Any missing shifts have been added for employees who forgot to clock in/out',
                'Any incorrect shifts have been overridden with correct times',
                'Overtime hours have been reviewed and verified',
                'Every single employee has been individually approved (the "Needs Review" count is 0)',
                'All employees now appear under the "Approved" tab',
              ].map((item) => (
                <label key={item} className="flex items-start gap-3 cursor-pointer group">
                  <input type="checkbox" className="mt-0.5 w-4 h-4 rounded border-2 border-gray-300 text-moja-blue focus:ring-moja-blue print:border-moja-blue" />
                  <span className="text-sm text-gray-700 group-hover:text-gray-900">{item}</span>
                </label>
              ))}
            </div>
          </Section>

          {/* Troubleshooting */}
          <Section title="Common Situations">
            <div className="space-y-4">
              <TroubleshootItem title="Employee forgot to clock in or out">
                Click on the affected day in their timecard grid. If the day is empty, the "Add Hours" pop-up will appear. If the day has a partial shift, the "Override Shift Hours" pop-up will appear. Enter the correct times and save.
              </TroubleshootItem>
              <TroubleshootItem title='Employee has a "LIVE" shift still running'>
                This means the employee is currently clocked in or forgot to clock out. You can either wait for them to clock out, or click on the shift and override it with the correct clock-out time.
              </TroubleshootItem>
              <TroubleshootItem title="Employee never reviewed their timecard">
                Their status will show "Pending." This is fine — you can still review and approve their timecard. Their hours are calculated from their actual clock-in/clock-out records regardless of whether they reviewed.
              </TroubleshootItem>
              <TroubleshootItem title="An employee is missing from the list">
                Their timecard may not have been generated. Click "Send Timecards," select just that employee, and send. Their timecard will appear in the list.
              </TroubleshootItem>
              <TroubleshootItem title="You need to change hours after already approving">
                Once approved, a timecard is locked. If you need to make a change, contact your system administrator to have the approval status reset.
              </TroubleshootItem>
            </div>
          </Section>

          {/* Footer */}
          <div className="pt-6 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400">Moja Behavioral Services — Admin Payroll Approval SOP</p>
            <p className="text-xs text-gray-300 mt-1">Last Updated: August 2026 | For internal use only</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-lg font-bold text-moja-blue pb-2 border-b-2 border-moja-orange mb-4">{title}</h2>
      {children}
    </div>
  );
}

function Step({ n, title, children }: { n: number | string; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 rounded-xl p-5">
      <div className="flex items-center gap-3 mb-3">
        <span className="w-7 h-7 rounded-full bg-moja-blue text-white text-xs font-bold flex items-center justify-center flex-shrink-0">{n}</span>
        <h3 className="font-bold text-gray-800">{title}</h3>
      </div>
      <div className="pl-10 text-sm text-gray-600 leading-relaxed">{children}</div>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-orange-50 border-l-4 border-moja-orange rounded-r-xl p-4">
      <p className="text-sm text-orange-800">{children}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg px-4 py-3">
      <p className="text-xs font-bold text-moja-blue uppercase tracking-wide">{label}</p>
      <p className="text-sm text-gray-700 mt-0.5">{value}</p>
    </div>
  );
}

function StatusRow({ icon, badge, badgeClass, meaning, action }: {
  icon: React.ReactNode; badge: string; badgeClass: string; meaning: string; action: string;
}) {
  return (
    <tr className="border-b border-gray-100">
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-1.5">
          {icon}
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badgeClass}`}>{badge}</span>
        </span>
      </td>
      <td className="px-4 py-3 text-gray-600">{meaning}</td>
      <td className="px-4 py-3 text-gray-600">{action}</td>
    </tr>
  );
}

function TroubleshootItem({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <p className="font-bold text-sm text-gray-800 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
        {title}
      </p>
      <p className="text-sm text-gray-600 mt-2 pl-6">{children}</p>
    </div>
  );
}
