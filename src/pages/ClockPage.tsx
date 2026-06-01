import { useState, useEffect, useCallback, useRef } from 'react';
import { LogIn, LogOut, Coffee, Delete, RotateCcw, User } from 'lucide-react';
import { callEdgeFunction } from '../lib/supabase';
import { Toast } from '../components/Toast';
import { BrandAccents, BrandDots } from '../components/BrandAccents';

interface StaffLookup {
  staff_name: string;
  staff_id: string;
  is_clocked_in: boolean;
  is_on_break: boolean;
}

interface ShiftSummary {
  staff_name: string;
  action: string;
  clock_in_time?: string;
  timestamp: string;
  duration_minutes?: number;
  break_minutes?: number;
  weekly_total_hours?: number;
}

export function ClockPage() {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [staffInfo, setStaffInfo] = useState<StaffLookup | null>(null);
  const [lookupError, setLookupError] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [shiftSummary, setShiftSummary] = useState<ShiftSummary | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const lookupDone = useRef(false);
  const currentPin = useRef('');

  useEffect(() => {
    currentPin.current = pin;
  }, [pin]);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (pin.length === 4 && !lookupDone.current) {
      lookupDone.current = true;
      lookupStaff(pin);
    }
    if (pin.length < 4) {
      lookupDone.current = false;
      setStaffInfo(null);
      setLookupError('');
    }
  }, [pin]);

  // Keyboard support
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (shiftSummary) {
        if (e.key === 'Escape' || e.key === 'Enter') {
          setShiftSummary(null);
        }
        return;
      }

      if (e.key >= '0' && e.key <= '9') {
        setPin(prev => prev.length < 4 ? prev + e.key : prev);
      } else if (e.key === 'Backspace') {
        setPin(prev => prev.slice(0, -1));
      } else if (e.key === 'Escape') {
        setPin('');
        setStaffInfo(null);
        setLookupError('');
        lookupDone.current = false;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shiftSummary]);

  async function lookupStaff(pinValue: string) {
    setLookingUp(true);
    setLookupError('');
    const result = await callEdgeFunction('/lookup-pin', { pin: pinValue });
    setLookingUp(false);
    if (result.success) {
      setStaffInfo({
        staff_name: result.staff_name,
        staff_id: result.staff_id,
        is_clocked_in: result.is_clocked_in,
        is_on_break: result.is_on_break || false,
      });
    } else {
      setLookupError(result.message || 'Invalid PIN');
      vibrate();
    }
  }

  function vibrate(pattern: number | number[] = 50) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  const handleDigit = useCallback((digit: string) => {
    vibrate(30);
    setPin(prev => prev.length < 4 ? prev + digit : prev);
  }, []);

  const handleDelete = useCallback(() => {
    setPin(prev => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    setPin('');
    setStaffInfo(null);
    setLookupError('');
    lookupDone.current = false;
  }, []);

  async function handleClock(action: 'in' | 'out') {
    if (pin.length !== 4 || !staffInfo) return;
    setLoading(true);

    const result = await callEdgeFunction(`/clock-${action}-by-pin`, { pin });

    setLoading(false);

    if (result.success) {
      vibrate([50, 50, 100]);
      setShiftSummary({
        staff_name: result.staff_name,
        action: action === 'in' ? 'Clocked In' : 'Clocked Out',
        clock_in_time: result.clock_in_time,
        timestamp: result.timestamp,
        duration_minutes: result.duration_minutes,
        break_minutes: result.break_minutes,
        weekly_total_hours: result.weekly_total_hours,
      });
      setPin('');
      setStaffInfo(null);
      lookupDone.current = false;
    } else {
      vibrate([100, 50, 100]);
      setToast({ message: result.message || 'Operation failed', type: 'error' });
      setPin('');
      setStaffInfo(null);
      lookupDone.current = false;
    }
  }

  async function handleBreak(action: 'start' | 'end') {
    if (pin.length !== 4 || !staffInfo) return;
    setLoading(true);

    const endpoint = action === 'start' ? '/start-break' : '/end-break';
    const result = await callEdgeFunction(endpoint, { pin });

    setLoading(false);

    if (result.success) {
      vibrate([50, 50]);
      const msg = action === 'start'
        ? `${result.staff_name} - Break Started`
        : `${result.staff_name} - Break Ended (${result.break_duration_minutes}m)`;
      setToast({ message: msg, type: 'success' });
      // Re-lookup to update state
      setTimeout(() => {
        lookupDone.current = false;
        const savedPin = currentPin.current;
        if (savedPin.length === 4) {
          lookupDone.current = true;
          lookupStaff(savedPin);
        }
      }, 300);
    } else {
      setToast({ message: result.message || 'Operation failed', type: 'error' });
    }
  }

  const hours = currentTime.getHours();
  const minutes = currentTime.getMinutes();
  const seconds = currentTime.getSeconds();

  const hourDeg = (hours % 12) * 30 + minutes * 0.5;
  const minuteDeg = minutes * 6;
  const secondDeg = seconds * 6;

  const timeString = currentTime.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const dateString = currentTime.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  // Shift summary overlay
  if (shiftSummary) {
    return (
      <div className="min-h-screen bg-moja-bg relative flex flex-col items-center justify-center p-4">
        <BrandAccents />
        <div className="relative z-10 w-full max-w-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
            <div className={`px-6 py-5 text-center ${
              shiftSummary.action === 'Clocked In' ? 'bg-green-50' : 'bg-moja-aqua/10'
            }`}>
              <div className={`inline-flex items-center justify-center w-14 h-14 rounded-full mb-3 ${
                shiftSummary.action === 'Clocked In' ? 'bg-green-100' : 'bg-moja-aqua/20'
              }`}>
                {shiftSummary.action === 'Clocked In'
                  ? <LogIn className="w-7 h-7 text-green-600" />
                  : <LogOut className="w-7 h-7 text-moja-aqua" />
                }
              </div>
              <h2 className="text-xl font-bold text-moja-blue">{shiftSummary.staff_name}</h2>
              <p className={`text-sm font-bold mt-1 ${
                shiftSummary.action === 'Clocked In' ? 'text-green-600' : 'text-moja-aqua'
              }`}>
                {shiftSummary.action}
              </p>
            </div>

            <div className="px-6 py-5 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-moja-blue/50">Time</span>
                <span className="text-sm font-bold text-moja-blue">
                  {new Date(shiftSummary.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {shiftSummary.clock_in_time && (
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-moja-blue/50">Shift Start</span>
                  <span className="text-sm font-bold text-moja-blue">
                    {new Date(shiftSummary.clock_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}

              {shiftSummary.duration_minutes != null && (
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-moja-blue/50">Shift Duration</span>
                  <span className="text-sm font-bold text-moja-blue">
                    {Math.floor(shiftSummary.duration_minutes / 60)}h {Math.round(shiftSummary.duration_minutes % 60)}m
                  </span>
                </div>
              )}

              {shiftSummary.break_minutes != null && shiftSummary.break_minutes > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-moja-blue/50">Break Time</span>
                  <span className="text-sm font-bold text-amber-600">
                    {shiftSummary.break_minutes}m deducted
                  </span>
                </div>
              )}

              {shiftSummary.weekly_total_hours != null && (
                <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                  <span className="text-sm font-semibold text-moja-blue/50">Weekly Total</span>
                  <span className="text-lg font-bold text-moja-blue">
                    {shiftSummary.weekly_total_hours}h
                  </span>
                </div>
              )}
            </div>

            <div className="px-6 pb-6">
              <button
                onClick={() => setShiftSummary(null)}
                className="w-full h-14 bg-moja-blue text-white rounded-xl font-bold hover:bg-moja-blue/90 active:scale-[0.98] transition-all touch-manipulation"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-moja-bg relative flex flex-col">
      <BrandAccents />

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center p-4 sm:p-6">
        {/* Analog Clock */}
        <div className="mb-4 sm:mb-6">
          <div className="relative w-40 h-40 sm:w-52 sm:h-52 lg:w-60 lg:h-60">
            <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-lg">
              <circle cx="100" cy="100" r="96" fill="white" stroke="#355574" strokeWidth="3" />

              {Array.from({ length: 12 }, (_, i) => {
                const angle = (i * 30 - 90) * (Math.PI / 180);
                const x1 = 100 + 80 * Math.cos(angle);
                const y1 = 100 + 80 * Math.sin(angle);
                const x2 = 100 + 90 * Math.cos(angle);
                const y2 = 100 + 90 * Math.sin(angle);
                return (
                  <line
                    key={i}
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke="#355574"
                    strokeWidth={i % 3 === 0 ? 3 : 1.5}
                    strokeLinecap="round"
                  />
                );
              })}

              {Array.from({ length: 60 }, (_, i) => {
                if (i % 5 === 0) return null;
                const angle = (i * 6 - 90) * (Math.PI / 180);
                const x1 = 100 + 86 * Math.cos(angle);
                const y1 = 100 + 86 * Math.sin(angle);
                const x2 = 100 + 90 * Math.cos(angle);
                const y2 = 100 + 90 * Math.sin(angle);
                return (
                  <line
                    key={`m${i}`}
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke="#355574"
                    strokeWidth="0.5"
                    opacity="0.4"
                    strokeLinecap="round"
                  />
                );
              })}

              <circle cx="100" cy="18" r="4" fill="#e66d38" />
              <circle cx="182" cy="100" r="4" fill="#6dccc2" />
              <circle cx="100" cy="182" r="4" fill="#efd35c" />
              <circle cx="18" cy="100" r="4" fill="#df76b6" />

              <line
                x1="100" y1="100"
                x2={100 + 45 * Math.cos((hourDeg - 90) * Math.PI / 180)}
                y2={100 + 45 * Math.sin((hourDeg - 90) * Math.PI / 180)}
                stroke="#355574"
                strokeWidth="4"
                strokeLinecap="round"
              />

              <line
                x1="100" y1="100"
                x2={100 + 65 * Math.cos((minuteDeg - 90) * Math.PI / 180)}
                y2={100 + 65 * Math.sin((minuteDeg - 90) * Math.PI / 180)}
                stroke="#355574"
                strokeWidth="2.5"
                strokeLinecap="round"
              />

              <line
                x1={100 - 15 * Math.cos((secondDeg - 90) * Math.PI / 180)}
                y1={100 - 15 * Math.sin((secondDeg - 90) * Math.PI / 180)}
                x2={100 + 70 * Math.cos((secondDeg - 90) * Math.PI / 180)}
                y2={100 + 70 * Math.sin((secondDeg - 90) * Math.PI / 180)}
                stroke="#e66d38"
                strokeWidth="1.5"
                strokeLinecap="round"
              />

              <circle cx="100" cy="100" r="5" fill="#e66d38" />
              <circle cx="100" cy="100" r="2" fill="white" />
            </svg>
          </div>
        </div>

        {/* Digital time */}
        <div className="text-center mb-5">
          <div className="text-3xl sm:text-4xl lg:text-5xl font-bold text-moja-blue font-mono tracking-tight">
            {timeString}
          </div>
          <div className="text-sm sm:text-base text-moja-blue/60 font-semibold mt-1">
            {dateString}
          </div>
          <BrandDots className="justify-center mt-2" />
        </div>

        {/* PIN Entry Card */}
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            {/* Staff name display */}
            {staffInfo && (
              <div className={`px-5 py-4 border-b flex items-center gap-3 animate-fade-in ${
                staffInfo.is_on_break
                  ? 'bg-amber-50 border-amber-100'
                  : staffInfo.is_clocked_in
                    ? 'bg-green-50 border-green-100'
                    : 'bg-moja-bg border-gray-100'
              }`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  staffInfo.is_on_break
                    ? 'bg-amber-100'
                    : staffInfo.is_clocked_in
                      ? 'bg-green-100'
                      : 'bg-moja-blue/10'
                }`}>
                  {staffInfo.is_on_break
                    ? <Coffee className="w-5 h-5 text-amber-600" />
                    : <User className={`w-5 h-5 ${staffInfo.is_clocked_in ? 'text-green-600' : 'text-moja-blue'}`} />
                  }
                </div>
                <div>
                  <p className="text-base font-bold text-moja-blue">{staffInfo.staff_name}</p>
                  <p className={`text-xs font-semibold ${
                    staffInfo.is_on_break
                      ? 'text-amber-600'
                      : staffInfo.is_clocked_in
                        ? 'text-green-600'
                        : 'text-moja-blue/50'
                  }`}>
                    {staffInfo.is_on_break
                      ? 'On break'
                      : staffInfo.is_clocked_in
                        ? 'Currently clocked in'
                        : 'Currently clocked out'}
                  </p>
                </div>
              </div>
            )}

            {lookupError && (
              <div className="px-5 py-3 border-b border-red-100 bg-red-50 animate-fade-in">
                <p className="text-sm font-semibold text-red-600">{lookupError}</p>
              </div>
            )}

            {lookingUp && (
              <div className="px-5 py-3 border-b border-gray-100 bg-moja-bg flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-moja-orange border-t-transparent rounded-full animate-spin" />
                <p className="text-sm font-semibold text-moja-blue/60">Verifying PIN...</p>
              </div>
            )}

            {/* PIN Display */}
            <div className="px-6 pt-5 pb-4">
              <p className="text-center text-sm font-bold text-moja-blue/60 uppercase tracking-wide mb-3">
                Enter Your PIN
              </p>
              <div className="flex justify-center gap-3">
                {[0, 1, 2, 3].map(i => (
                  <div
                    key={i}
                    className={`w-14 h-14 sm:w-16 sm:h-16 rounded-xl border-2 flex items-center justify-center text-2xl font-bold transition-all duration-150 ${
                      pin.length > i
                        ? 'border-moja-orange bg-moja-orange/5 text-moja-orange scale-105'
                        : pin.length === i
                          ? 'border-moja-blue/40 bg-moja-bg'
                          : 'border-moja-blue/15 bg-moja-bg'
                    }`}
                  >
                    {pin.length > i ? '\u2022' : ''}
                  </div>
                ))}
              </div>
            </div>

            {/* Numeric Keypad */}
            <div className="px-5 pb-4">
              <div className="grid grid-cols-3 gap-2.5 max-w-[280px] mx-auto">
                {['1','2','3','4','5','6','7','8','9'].map(digit => (
                  <button
                    key={digit}
                    onClick={() => handleDigit(digit)}
                    className="h-[60px] rounded-xl bg-moja-blue text-white text-xl font-bold hover:bg-moja-blue/80 active:scale-95 transition-all touch-manipulation"
                  >
                    {digit}
                  </button>
                ))}
                <button
                  onClick={handleClear}
                  className="h-[60px] rounded-xl bg-moja-yellow/30 hover:bg-moja-yellow/50 active:scale-95 text-xs font-bold text-moja-blue transition-all flex items-center justify-center gap-1 touch-manipulation"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Clear
                </button>
                <button
                  onClick={() => handleDigit('0')}
                  className="h-[60px] rounded-xl bg-moja-blue text-white text-xl font-bold hover:bg-moja-blue/80 active:scale-95 transition-all touch-manipulation"
                >
                  0
                </button>
                <button
                  onClick={handleDelete}
                  className="h-[60px] rounded-xl bg-moja-pink/20 hover:bg-moja-pink/40 active:scale-95 text-xs font-bold text-moja-blue transition-all flex items-center justify-center gap-1 touch-manipulation"
                >
                  <Delete className="w-3.5 h-3.5" />
                  Del
                </button>
              </div>
            </div>

            {/* Clock In / Clock Out / Break Buttons */}
            <div className="px-5 pb-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleClock('in')}
                  disabled={!staffInfo || loading || (staffInfo?.is_clocked_in ?? false)}
                  className="h-[64px] rounded-xl bg-moja-orange text-white text-base font-bold flex items-center justify-center gap-2 transition-all touch-manipulation disabled:opacity-30 disabled:cursor-not-allowed hover:bg-moja-orange/90 active:scale-[0.97]"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <LogIn className="w-5 h-5" />
                      Clock In
                    </>
                  )}
                </button>
                <button
                  onClick={() => handleClock('out')}
                  disabled={!staffInfo || loading || !(staffInfo?.is_clocked_in ?? false)}
                  className="h-[64px] rounded-xl bg-moja-aqua text-white text-base font-bold flex items-center justify-center gap-2 transition-all touch-manipulation disabled:opacity-30 disabled:cursor-not-allowed hover:bg-moja-aqua/90 active:scale-[0.97]"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <LogOut className="w-5 h-5" />
                      Clock Out
                    </>
                  )}
                </button>
              </div>

              {/* Break button - only shows when clocked in */}
              {staffInfo?.is_clocked_in && (
                <button
                  onClick={() => handleBreak(staffInfo.is_on_break ? 'end' : 'start')}
                  disabled={loading}
                  className={`w-full h-[52px] rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all touch-manipulation disabled:opacity-30 active:scale-[0.98] ${
                    staffInfo.is_on_break
                      ? 'bg-amber-500 text-white hover:bg-amber-500/90'
                      : 'bg-amber-50 text-amber-700 border-2 border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  <Coffee className="w-4 h-4" />
                  {staffInfo.is_on_break ? 'End Break' : 'Start Break'}
                </button>
              )}
            </div>
          </div>

          <div className="mt-5 flex items-center justify-center gap-4">
            <a
              href="#/my-hours"
              className="text-xs text-moja-blue/30 hover:text-moja-aqua transition-colors font-semibold"
            >
              My Hours
            </a>
            <span className="text-moja-blue/10">|</span>
            <a
              href="#/admin"
              className="text-xs text-moja-blue/30 hover:text-moja-aqua transition-colors font-semibold"
            >
              Admin
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
