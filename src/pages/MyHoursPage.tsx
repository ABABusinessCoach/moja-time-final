import { useState, useEffect } from 'react';
import { callEdgeFunction } from '../lib/supabase';
import { ArrowLeft, Clock, Coffee, TrendingUp, Calendar } from 'lucide-react';
import { BrandAccents, BrandDots } from '../components/BrandAccents';

interface HoursLog {
  id: string;
  clock_in_time: string;
  clock_out_time: string | null;
  duration_minutes: number | null;
  notes: string;
}

interface HoursBreak {
  clock_log_id: string;
  break_start: string;
  break_end: string | null;
  duration_minutes: number | null;
  break_type: string;
}

interface WeekData {
  start: string;
  end: string;
  logs: HoursLog[];
  breaks: HoursBreak[];
  total_hours: number;
}

interface HoursData {
  staff_name: string;
  is_clocked_in: boolean;
  is_on_break: boolean;
  pay_period_start: string;
  pay_period_end: string;
  current_week: 1 | 2;
  week1: WeekData;
  week2: WeekData;
  total_hours: number;
  overtime_threshold: number;
}

export function MyHoursPage() {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<HoursData | null>(null);
  const [error, setError] = useState('');
  const [activeWeek, setActiveWeek] = useState<1 | 2>(1);

  async function fetchHours() {
    if (pin.length !== 4) return;
    setLoading(true);
    setError('');

    const result = await callEdgeFunction('/my-hours', { pin });

    if (result.success) {
      const d = result as unknown as HoursData;
      setData(d);
      setActiveWeek(d.current_week);
    } else {
      setError(result.message || 'Failed to load hours');
    }
    setLoading(false);
  }

  useEffect(() => {
    if (pin.length === 4) {
      fetchHours();
    }
  }, [pin]);

  function getDayName(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' });
  }

  function formatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' });
  }

  function formatDuration(mins: number): string {
    if (mins <= 0) return '0.00';
    return (mins / 60).toFixed(2);
  }

  function formatShortDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
  }

  if (data) {
    const currentWeekData = activeWeek === 1 ? data.week1 : data.week2;
    const weekHours = currentWeekData.total_hours;
    const progressPercent = Math.min(100, (weekHours / data.overtime_threshold) * 100);
    const payPeriodTotal = data.total_hours;

    const breaksByLog = new Map<string, HoursBreak[]>();
    currentWeekData.breaks.forEach(b => {
      const list = breaksByLog.get(b.clock_log_id) || [];
      list.push(b);
      breaksByLog.set(b.clock_log_id, list);
    });

    return (
      <div className="min-h-screen bg-moja-bg relative">
        <BrandAccents />
        <div className="relative z-10 max-w-lg mx-auto p-4 sm:p-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-5">
            <button
              onClick={() => { setData(null); setPin(''); }}
              className="p-2 hover:bg-white rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-moja-blue" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-moja-blue">{data.staff_name}</h1>
              <p className="text-xs font-semibold text-moja-blue/50">
                Pay Period: {formatShortDate(data.pay_period_start)} - {formatShortDate(data.pay_period_end)}
              </p>
            </div>
            {data.is_clocked_in && (
              <span className="ml-auto text-xs font-bold text-green-700 bg-green-50 px-3 py-1.5 rounded-full">
                {data.is_on_break ? 'On Break' : 'Clocked In'}
              </span>
            )}
          </div>

          {/* Pay Period Summary */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-moja-blue/50" />
                <span className="text-xs font-bold text-moja-blue/60 uppercase tracking-wide">Pay Period Total</span>
              </div>
              <span className="text-xl font-bold text-moja-blue font-mono">
                {formatDuration(payPeriodTotal * 60)}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs font-semibold text-moja-blue/40">
              <span>Wk 1: {formatDuration(data.week1.total_hours * 60)}</span>
              <span className="text-moja-blue/20">|</span>
              <span>Wk 2: {formatDuration(data.week2.total_hours * 60)}</span>
            </div>
          </div>

          {/* Week Tabs */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setActiveWeek(1)}
              className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all ${
                activeWeek === 1
                  ? 'bg-moja-blue text-white shadow-md'
                  : 'bg-white text-moja-blue/60 border border-gray-100 hover:border-moja-blue/30'
              }`}
            >
              <span className="block">Week 1</span>
              <span className={`text-xs font-semibold ${activeWeek === 1 ? 'text-white/70' : 'text-moja-blue/40'}`}>
                {formatShortDate(data.week1.start)} - {formatShortDate(data.week1.end)}
              </span>
            </button>
            <button
              onClick={() => setActiveWeek(2)}
              className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all ${
                activeWeek === 2
                  ? 'bg-moja-blue text-white shadow-md'
                  : 'bg-white text-moja-blue/60 border border-gray-100 hover:border-moja-blue/30'
              }`}
            >
              <span className="block">Week 2</span>
              <span className={`text-xs font-semibold ${activeWeek === 2 ? 'text-white/70' : 'text-moja-blue/40'}`}>
                {formatShortDate(data.week2.start)} - {formatShortDate(data.week2.end)}
              </span>
            </button>
          </div>

          {/* Weekly Hours Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-moja-aqua" />
                <span className="text-sm font-bold text-moja-blue">Week {activeWeek} Hours</span>
              </div>
              <span className="text-2xl font-bold text-moja-blue font-mono">
                {formatDuration(weekHours * 60)}
              </span>
            </div>

            {/* Progress bar */}
            <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden mb-2">
              <div
                className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${
                  progressPercent >= 100 ? 'bg-moja-orange' : 'bg-moja-aqua'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-xs font-semibold text-moja-blue/50">
              <span>0h</span>
              <span>
                {weekHours < data.overtime_threshold
                  ? `${formatDuration((data.overtime_threshold - weekHours) * 60)} until OT`
                  : `${formatDuration((weekHours - data.overtime_threshold) * 60)} overtime`}
              </span>
              <span>{data.overtime_threshold}h</span>
            </div>
          </div>

          {/* Daily Breakdown */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-moja-blue/50" />
              <span className="text-sm font-bold text-moja-blue">Shifts - Week {activeWeek}</span>
            </div>

            {currentWeekData.logs.length === 0 ? (
              <div className="p-6 text-center text-moja-blue/40 font-semibold text-sm">
                No shifts recorded this week
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {currentWeekData.logs.map(log => {
                  const logBreaks = breaksByLog.get(log.id) || [];
                  const totalBreakMins = logBreaks.reduce((s, b) => s + (b.duration_minutes || 0), 0);
                  const lunchMins = logBreaks.filter(b => b.break_type === 'lunch').reduce((s, b) => s + (b.duration_minutes || 0), 0);
                  const netMinutes = log.duration_minutes != null ? log.duration_minutes - lunchMins : null;

                  return (
                    <div key={log.id} className="px-5 py-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-bold text-moja-blue">
                            {getDayName(log.clock_in_time)}
                          </span>
                          <span className="text-xs text-moja-blue/50 ml-2 font-semibold">
                            {formatTime(log.clock_in_time)}
                            {log.clock_out_time ? ` - ${formatTime(log.clock_out_time)}` : ' (active)'}
                          </span>
                        </div>
                        {netMinutes != null && (
                          <span className="text-sm font-bold text-moja-blue font-mono">
                            {formatDuration(netMinutes)}
                          </span>
                        )}
                        {!log.clock_out_time && (
                          <span className="text-xs font-bold text-moja-aqua bg-moja-aqua/10 px-2 py-1 rounded-full">
                            Active
                          </span>
                        )}
                      </div>
                      {totalBreakMins > 0 && (
                        <div className="flex items-center gap-1 mt-1">
                          <Coffee className="w-3 h-3 text-moja-yellow" />
                          <span className="text-xs font-semibold text-moja-blue/40">
                            {formatDuration(totalBreakMins)} break
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Back link */}
          <div className="mt-6 text-center">
            <a href="#/" className="text-sm font-bold text-moja-blue/40 hover:text-moja-aqua transition-colors">
              Back to Time Clock
            </a>
          </div>
        </div>
      </div>
    );
  }

  // PIN Entry Screen
  return (
    <div className="min-h-screen bg-moja-bg relative flex flex-col items-center justify-center p-4">
      <BrandAccents />
      <div className="relative z-10 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-moja-blue rounded-2xl mb-3">
            <Clock className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-moja-blue">My Hours</h1>
          <p className="text-sm font-semibold text-moja-blue/50 mt-1">Enter your PIN to view your timesheet</p>
          <BrandDots className="justify-center mt-2" />
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-100 rounded-xl">
              <p className="text-sm font-semibold text-red-600">{error}</p>
            </div>
          )}

          {/* PIN dots */}
          <div className="flex justify-center gap-3 mb-5">
            {[0, 1, 2, 3].map(i => (
              <div
                key={i}
                className={`w-14 h-14 rounded-xl border-2 flex items-center justify-center text-2xl font-bold transition-all duration-150 ${
                  pin.length > i
                    ? 'border-moja-aqua bg-moja-aqua/5 text-moja-aqua scale-105'
                    : pin.length === i
                      ? 'border-moja-blue/40 bg-moja-bg'
                      : 'border-moja-blue/15 bg-moja-bg'
                }`}
              >
                {pin.length > i ? '\u2022' : ''}
              </div>
            ))}
          </div>

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-2.5 max-w-[260px] mx-auto">
            {['1','2','3','4','5','6','7','8','9','','0',''].map((digit, i) => {
              if (digit === '' && i === 9) {
                return <div key="empty-left" />;
              }
              if (digit === '' && i === 11) {
                return (
                  <button
                    key="del"
                    onClick={() => setPin(p => p.slice(0, -1))}
                    className="h-[56px] rounded-xl bg-moja-pink/15 text-xs font-bold text-moja-blue hover:bg-moja-pink/30 active:scale-95 transition-all touch-manipulation"
                  >
                    Del
                  </button>
                );
              }
              return (
                <button
                  key={digit}
                  onClick={() => setPin(p => p.length < 4 ? p + digit : p)}
                  className="h-[56px] rounded-xl bg-moja-blue text-white text-xl font-bold hover:bg-moja-blue/80 active:scale-95 transition-all touch-manipulation"
                >
                  {digit}
                </button>
              );
            })}
          </div>

          {loading && (
            <div className="flex items-center justify-center mt-4">
              <div className="w-6 h-6 border-3 border-moja-aqua border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        <div className="mt-5 text-center">
          <a href="#/" className="text-xs font-semibold text-moja-blue/30 hover:text-moja-aqua transition-colors">
            Back to Time Clock
          </a>
        </div>
      </div>
    </div>
  );
}
