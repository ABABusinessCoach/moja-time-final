export const PAY_CODES = [
  { code: '1099NEC', label: '1099NEC' },
  { code: 'BD', label: 'Birthday' },
  { code: 'BO', label: 'Bonus' },
  { code: 'FLH', label: 'Floating Holiday' },
  { code: 'HO', label: 'Holiday' },
  { code: 'HOW', label: 'Holiday Worked' },
  { code: 'MI', label: 'Misc Earnings' },
  { code: 'OTP', label: 'OTP' },
  { code: 'OT', label: 'Overtime' },
  { code: 'PTO', label: 'PTO' },
  { code: 'RG', label: 'Regular' },
  { code: 'REIM', label: 'REIMBURSEMENT' },
  { code: 'SA', label: 'Salary' },
  { code: 'SK', label: 'Sick' },
  { code: 'TR', label: 'Training' },
  { code: 'UNPAID', label: 'Unpaid Time Off' },
  { code: 'VA', label: 'Vacation' },
  { code: 'VOL', label: 'Volunteer' },
  { code: 'WELLNESS', label: 'WELLNESS' },
] as const;

export function payCodeLabel(code: string | null | undefined): string {
  if (!code) return '';
  const match = PAY_CODES.find(p => p.code === code);
  return match ? `${match.label} (${match.code})` : code;
}
