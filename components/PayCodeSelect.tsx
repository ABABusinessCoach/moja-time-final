import { Tag } from 'lucide-react';
import { PAY_CODES } from '../lib/payCodes';

export function PayCodeSelect({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1">
        <Tag className="w-3 h-3" />
        Payroll Code
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full h-11 px-3 text-sm font-semibold text-gray-800 bg-white border-2 border-gray-200 rounded-lg focus:outline-none focus:border-moja-blue transition-colors cursor-pointer"
      >
        <option value="">(none)</option>
        {PAY_CODES.map(p => (
          <option key={p.code} value={p.code}>{p.label} ({p.code})</option>
        ))}
      </select>
    </div>
  );
}
