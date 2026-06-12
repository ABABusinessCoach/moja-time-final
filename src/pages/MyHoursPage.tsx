import { useState, useEffect } from 'react';
import { callEdgeFunction } from '../lib/supabase';
import { ArrowLeft, Clock, Coffee, TrendingUp } from 'lucide-react';
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
}

interface HoursData {
  staff_name: string;
  is_clocked_in: boolean;
  is_on_break: boolean;
  week_start: string;
  week_end: string;
  logs: HoursLog[];
  breaks: HoursBreak[];
  total_hours: number;
  overtime_threshold: number;
  remaining_hours: number;
}

export function MyHoursPage() {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<HoursData | null>(null);
  const [error, setError] = useState('');

  async function fetchHours() {
    if (pin.length !== 4) return;
    setLoading(true);
    setError('');

    const result = await callEdgeFunction('/my-hours', { pin });

    if (result.success) {
      setData(result as unknown as HoursData);
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
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return `${h}h ${m}m`;
  }

  const progressPercent = data
    ? Math.min(100, (data.total_hours / data.overtime_threshold) * 100)
    : 0;

  if (data) {
    const breaksByLog = new Map<string, HoursBreak[]>();
    data.breaks.forEach(b => {
      const list = breaksByLog.get(b.clock_log_id) || [];
      list.push(b);
      breaksByLog.set(b.clock_log_id, list);
    });

    return (
      <div className="min-h-screen bg-moja-bg relative">
        <BrandAccents />
        <div className="relative z-10 max-w-lg mx-auto p-4 sm:p-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => { setData(null); setPin(''); }}
              className="p-2 hover:bg-white rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-moja-blue" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-moja-blue">{data.staff_name}</h1>
              <p className="text-xs font-semibold text-moja-blue/50">
                Week of {new Date(data.week_start).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'long', day: 'numeric' })}
              </p>
            </div>
            {data.is_clocked_in && (
              <span className="ml-auto text-xs font-bold text-green-700 bg-green-50 px-3 py-1.5 rounded-full">
                {data.is_on_break ? 'On Break' : 'Clocked In'}
              </span>
            )}
          </div>

          {/* Weekly Summary Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-moja-aqua" />
                <span className="text-sm font-bold text-moja-blue">Weekly Total</span>
              </div>
              <span className="text-2xl font-bold text-moja-blue font-mono">
                {data.total_hours}h
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
              {/* OT warning line at threshold */}
              <div
                className="absolute inset-y-0 w-0.5 bg-moja-blue/30"
                style={{ left: '100%' }}
              />
            </div>
            <div className="flex justify-between text-xs font-semibold text-moja-blue/50">
              <span>0h</span>
              <span>
                {data.remaining_hours > 0
                  ? `${data.remaining_hours}h until OT`
                  : `${(data.total_hours - data.overtime_threshold).toFixed(1)}h overtime`}
              </span>
              <span>{data.overtime_threshold}h</span>
            </div>
          </div>

          {/* Daily Breakdown */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-moja-blue/50" />
              <span className="text-sm font-bold text-moja-blue">Shifts This Week</span>
            </div>

            {data.logs.length === 0 ? (
              <div className="p-6 text-center text-moja-blue/40 font-semibold text-sm">
                No shifts recorded this week
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {data.logs.map(log => {
                  const logBreaks = breaksByLog.get(log.id) || [];
                  const totalBreakMins = logBreaks.reduce((s, b) => s + (b.duration_minutes || 0), 0);

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
                        {log.duration_minutes != null && (
                          <span className="text-sm font-bold text-moja-blue font-mono">
                            {formatDuration(log.duration_minutes)}
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
