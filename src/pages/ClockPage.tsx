import { useState, useEffect, useCallback, useRef } from 'react';
import { LogIn, LogOut, UtensilsCrossed, Coffee, Delete, RotateCcw, User } from 'lucide-react';
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
  action: 'clock_in' | 'clock_out' | 'start_break' | 'start_lunch' | 'end_break' | 'end_lunch';
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
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function resetInactivityTimer() {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(() => {
      setPin('');
      setStaffInfo(null);
      setLookupError('');
      lookupDone.current = false;
    }, 45000);
  }

  useEffect(() => {
    if (pin.length > 0) {
      resetInactivityTimer();
    } else if (inactivityTimer.current) {
      clearTimeout(inactivityTimer.current);
      inactivityTimer.current = null;
    }
    return () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, [pin, staffInfo]);

  useEffect(() => {
    currentPin.current = pin;
  }, [pin]);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (pin.length === 4 && !lookupDone.current && !loading) {
      lookupDone.current = true;
      lookupStaff(pin);
    }
    if (pin.length < 4 && !loading) {
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

      if (loading) return;

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
  }, [shiftSummary, loading]);

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
    if (pin.length !== 4 || !staffInfo || loading) return;
    setLoading(true);

    const result = await callEdgeFunction(`/clock-${action}-by-pin`, { pin });

    setLoading(false);

    if (result.success) {
      vibrate([50, 50, 100]);
      setShiftSummary({
        staff_name: result.staff_name,
        action: action === 'in' ? 'clock_in' : 'clock_out',
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

  async function handleBreak(action: 'start' | 'end', breakType: 'break' | 'lunch' = 'break') {
    if (pin.length !== 4 || !staffInfo || loading) return;
    setLoading(true);

    const endpoint = action === 'start' ? '/start-break' : '/end-break';
    const result = await callEdgeFunction(endpoint, { pin, break_type: breakType });

    setLoading(false);

    if (result.success) {
      vibrate([50, 50]);
      const resolvedType = result.break_type || breakType;
      const actionKey = action === 'start'
        ? (resolvedType === 'lunch' ? 'start_lunch' : 'start_break')
        : (resolvedType === 'lunch' ? 'end_lunch' : 'end_break');
      setShiftSummary({
        staff_name: result.staff_name,
        action: actionKey as ShiftSummary['action'],
        timestamp: result.timestamp || new Date().toISOString(),
        duration_minutes: result.break_duration_minutes,
      });
      setPin('');
      setStaffInfo(null);
      lookupDone.current = false;
    } else {
      setToast({ message: result.message || 'Operation failed', type: 'error' });
    }
  }

  const estOptions = { timeZone: 'America/New_York' } as const;
  const hours = parseInt(currentTime.toLocaleString('en-US', { ...estOptions, hour: 'numeric', hour12: false }));
  const minutes = parseInt(currentTime.toLocaleString('en-US', { ...estOptions, minute: 'numeric' }));
  const seconds = parseInt(currentTime.toLocaleString('en-US', { ...estOptions, second: 'numeric' }));

  const hourDeg = (hours % 12) * 30 + minutes * 0.5;
  const minuteDeg = minutes * 6;
  const secondDeg = seconds * 6;

  const timeString = currentTime.toLocaleTimeString('en-US', {
    ...estOptions,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const dateString = currentTime.toLocaleDateString('en-US', {
    ...estOptions,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  // Shift summary overlay
  if (shiftSummary) {
    const firstName = shiftSummary.staff_name.split(' ')[0];
    const ts = new Date(shiftSummary.timestamp);
    const timeDisplay = ts.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
    const dateDisplay = ts.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', day: 'numeric', month: 'short' });

    const configs = {
      clock_in: {
        bg: 'bg-green-50',
        border: 'border-green-200',
        badge: 'Paid time starts',
        badgeBg: 'bg-green-100 text-green-700',
        iconBg: 'bg-green-100',
        iconColor: 'text-green-600',
        icon: <LogIn className="w-6 h-6" />,
        title: `You're in, ${firstName}!`,
        subtitle: "Great to see you. Let's make today a good one.",
        button: "Got it, let's go!",
        buttonBg: 'bg-green-600 hover:bg-green-700',
      },
      clock_out: {
        bg: 'bg-orange-50',
        border: 'border-orange-200',
        badge: 'Shift ended',
        badgeBg: 'bg-orange-100 text-orange-700',
        iconBg: 'bg-orange-100',
        iconColor: 'text-orange-600',
        icon: <LogOut className="w-6 h-6" />,
        title: `All done for today!`,
        subtitle: `You're clocked out, ${firstName}. Take care of yourself out there.`,
        button: 'Bye!',
        buttonBg: 'bg-orange-500 hover:bg-orange-600',
      },
      start_break: {
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        badge: 'Paid break \u2014 clock running',
        badgeBg: 'bg-amber-100 text-amber-700',
        iconBg: 'bg-amber-100',
        iconColor: 'text-amber-700',
        icon: <Coffee className="w-6 h-6" />,
        title: `Break time, ${firstName}!`,
        subtitle: "You've got 15 minutes \u2014 go breathe some fresh air.",
        button: 'See you soon!',
        buttonBg: 'bg-amber-600 hover:bg-amber-700',
      },
      start_lunch: {
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        badge: 'Lunch break \u2014 clock paused',
        badgeBg: 'bg-amber-100 text-amber-700',
        iconBg: 'bg-amber-100',
        iconColor: 'text-amber-700',
        icon: <UtensilsCrossed className="w-6 h-6" />,
        title: `Enjoy your lunch, ${firstName}!`,
        subtitle: "Take your time and recharge. You've earned it.",
        button: 'Bon appetit!',
        buttonBg: 'bg-amber-600 hover:bg-amber-700',
      },
      end_break: {
        bg: 'bg-sky-50',
        border: 'border-sky-200',
        badge: 'Back from break',
        badgeBg: 'bg-sky-100 text-sky-700',
        iconBg: 'bg-sky-100',
        iconColor: 'text-sky-600',
        icon: <Coffee className="w-6 h-6" />,
        title: `Welcome back, ${firstName}!`,
        subtitle: shiftSummary.duration_minutes
          ? `Break was ${shiftSummary.duration_minutes}m. Let's finish strong.`
          : "Let's finish strong.",
        button: "Let's go!",
        buttonBg: 'bg-sky-600 hover:bg-sky-700',
      },
      end_lunch: {
        bg: 'bg-sky-50',
        border: 'border-sky-200',
        badge: 'Back from lunch',
        badgeBg: 'bg-sky-100 text-sky-700',
        iconBg: 'bg-sky-100',
        iconColor: 'text-sky-600',
        icon: <UtensilsCrossed className="w-6 h-6" />,
        title: `Welcome back, ${firstName}!`,
        subtitle: shiftSummary.duration_minutes
          ? `Lunch was ${shiftSummary.duration_minutes}m. Ready to finish the day.`
          : "Hope that was good. Ready to finish the day.",
        button: "Let's go!",
        buttonBg: 'bg-sky-600 hover:bg-sky-700',
      },
    };

    const c = configs[shiftSummary.action];

    return (
      <div className="min-h-[100dvh] bg-moja-bg relative flex flex-col items-center justify-center p-3 sm:p-4">
        <BrandAccents />
        <div className="relative z-10 w-full max-w-sm animate-fade-in">
          <p className="text-xs sm:text-sm text-gray-400 mb-2 ml-1 font-medium">
            {shiftSummary.action === 'clock_in' ? 'Clocking in' : shiftSummary.action === 'clock_out' ? 'Clocking out' : 'Break update'}
          </p>
          <div className={`rounded-2xl border-2 ${c.border} ${c.bg} p-5 sm:p-6 shadow-sm`}>
            <div className="flex flex-col items-center text-center">
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${c.badgeBg} mb-3 sm:mb-4`}>
                {c.badge}
              </span>

              <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center ${c.iconBg} ${c.iconColor} mb-3 sm:mb-4`}>
                {c.icon}
              </div>

              <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-1">{c.title}</h2>
              <p className="text-xs sm:text-sm text-gray-500 mb-4 sm:mb-5 leading-relaxed">{c.subtitle}</p>

              <p className="text-xs sm:text-sm text-gray-400 font-medium mb-5 sm:mb-6">
                {timeDisplay} &middot; {dateDisplay}
              </p>

              <button
                onClick={() => setShiftSummary(null)}
                className={`w-full h-12 sm:h-14 ${c.buttonBg} text-white rounded-xl font-bold active:scale-[0.98] transition-all touch-manipulation text-sm sm:text-base`}
              >
                {c.button}
              </button>

            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-moja-bg relative flex flex-col">
      <BrandAccents />

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-3 sm:p-6">
        <div className="w-full max-w-4xl flex flex-col lg:flex-row items-center lg:items-stretch gap-4 lg:gap-10">

          {/* Clock Section - hidden on very small screens when not needed, compact on mobile */}
          <div className="flex-1 flex flex-col items-center justify-center hidden sm:flex">
            {/* Analog Clock */}
            <div className="mb-4 sm:mb-6">
              <div className="relative w-40 h-40 sm:w-56 sm:h-56 lg:w-64 lg:h-64">
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
            <div className="text-center">
              <div className="text-3xl sm:text-4xl lg:text-5xl font-bold text-moja-blue font-mono tracking-tight">
                {timeString}
              </div>
              <div className="text-sm sm:text-base text-moja-blue/60 font-semibold mt-1">
                {dateString}
              </div>
              <BrandDots className="justify-center mt-2" />
            </div>
          </div>

          {/* Mobile compact time header - shown only on small screens */}
          <div className="sm:hidden w-full text-center pb-1">
            <div className="text-2xl font-bold text-moja-blue font-mono tracking-tight">
              {timeString}
            </div>
            <div className="text-xs text-moja-blue/60 font-semibold">
              {dateString}
            </div>
          </div>

          {/* PIN Entry Section */}
          <div className="w-full max-w-sm lg:w-[360px] lg:flex-shrink-0 flex flex-col">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
              {/* Staff name display */}
              {staffInfo && (
                <div className={`px-4 py-3 sm:px-5 sm:py-4 border-b flex items-center gap-3 animate-fade-in ${
                  staffInfo.is_on_break
                    ? 'bg-amber-50 border-amber-100'
                    : staffInfo.is_clocked_in
                      ? 'bg-green-50 border-green-100'
                      : 'bg-moja-bg border-gray-100'
                }`}>
                  <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center ${
                    staffInfo.is_on_break
                      ? 'bg-amber-100'
                      : staffInfo.is_clocked_in
                        ? 'bg-green-100'
                        : 'bg-moja-blue/10'
                  }`}>
                    {staffInfo.is_on_break
                      ? <UtensilsCrossed className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
                      : <User className={`w-4 h-4 sm:w-5 sm:h-5 ${staffInfo.is_clocked_in ? 'text-green-600' : 'text-moja-blue'}`} />
                    }
                  </div>
                  <div>
                    <p className="text-sm sm:text-base font-bold text-moja-blue">{staffInfo.staff_name}</p>
                    <p className={`text-xs font-semibold ${
                      staffInfo.is_on_break
                        ? 'text-amber-600'
                        : staffInfo.is_clocked_in
                          ? 'text-green-600'
                          : 'text-moja-blue/50'
                    }`}>
                      {staffInfo.is_on_break
                        ? 'On lunch break'
                        : staffInfo.is_clocked_in
                          ? 'Currently clocked in'
                          : 'Currently clocked out'}
                    </p>
                  </div>
                </div>
              )}

              {lookupError && (
                <div className="px-4 py-2.5 sm:px-5 sm:py-3 border-b border-red-100 bg-red-50 animate-fade-in">
                  <p className="text-sm font-semibold text-red-600">{lookupError}</p>
                </div>
              )}

              {lookingUp && (
                <div className="px-4 py-2.5 sm:px-5 sm:py-3 border-b border-gray-100 bg-moja-bg flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-moja-orange border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm font-semibold text-moja-blue/60">Verifying PIN...</p>
                </div>
              )}

              {/* PIN Display */}
              <div className="px-4 pt-4 pb-3 sm:px-6 sm:pt-5 sm:pb-4">
                <p className="text-center text-xs sm:text-sm font-bold text-moja-blue/60 uppercase tracking-wide mb-2.5 sm:mb-3">
                  Enter Your PIN
                </p>
                <div className="flex justify-center gap-2.5 sm:gap-3">
                  {[0, 1, 2, 3].map(i => (
                    <div
                      key={i}
                      className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl border-2 flex items-center justify-center text-xl sm:text-2xl font-bold transition-all duration-150 ${
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
              <div className={`px-4 pb-3 sm:px-5 sm:pb-4 ${loading ? 'pointer-events-none opacity-50' : ''}`}>
                <div className="grid grid-cols-3 gap-2 sm:gap-2.5 max-w-[260px] sm:max-w-[280px] mx-auto">
                  {['1','2','3','4','5','6','7','8','9'].map(digit => (
                    <button
                      key={digit}
                      onClick={() => handleDigit(digit)}
                      disabled={loading}
                      className="h-[52px] sm:h-[60px] rounded-xl bg-moja-blue text-white text-lg sm:text-xl font-bold hover:bg-moja-blue/80 active:scale-95 transition-all touch-manipulation disabled:opacity-50"
                    >
                      {digit}
                    </button>
                  ))}
                  <button
                    onClick={handleClear}
                    disabled={loading}
                    className="h-[52px] sm:h-[60px] rounded-xl bg-moja-yellow/30 hover:bg-moja-yellow/50 active:scale-95 text-xs font-bold text-moja-blue transition-all flex items-center justify-center gap-1 touch-manipulation disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Clear
                  </button>
                  <button
                    onClick={() => handleDigit('0')}
                    disabled={loading}
                    className="h-[52px] sm:h-[60px] rounded-xl bg-moja-blue text-white text-lg sm:text-xl font-bold hover:bg-moja-blue/80 active:scale-95 transition-all touch-manipulation disabled:opacity-50"
                  >
                    0
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={loading}
                    className="h-[52px] sm:h-[60px] rounded-xl bg-moja-pink/20 hover:bg-moja-pink/40 active:scale-95 text-xs font-bold text-moja-blue transition-all flex items-center justify-center gap-1 touch-manipulation disabled:opacity-50"
                  >
                    <Delete className="w-3.5 h-3.5" />
                    Del
                  </button>
                </div>
              </div>

              {/* Clock In / Clock Out / Lunch / Break Buttons */}
              <div className="px-4 pb-4 space-y-2.5 sm:px-5 sm:pb-5 sm:space-y-3">
                <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                  <button
                    onClick={() => handleClock('in')}
                    disabled={!staffInfo || loading || (staffInfo?.is_clocked_in ?? false)}
                    className="h-[54px] sm:h-[64px] rounded-xl bg-moja-orange text-white text-sm sm:text-base font-bold flex items-center justify-center gap-2 transition-all touch-manipulation disabled:opacity-30 disabled:cursor-not-allowed hover:bg-moja-orange/90 active:scale-[0.97]"
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <LogIn className="w-4 h-4 sm:w-5 sm:h-5" />
                        Clock In
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleClock('out')}
                    disabled={!staffInfo || loading || !(staffInfo?.is_clocked_in ?? false)}
                    className="h-[54px] sm:h-[64px] rounded-xl bg-moja-aqua text-white text-sm sm:text-base font-bold flex items-center justify-center gap-2 transition-all touch-manipulation disabled:opacity-30 disabled:cursor-not-allowed hover:bg-moja-aqua/90 active:scale-[0.97]"
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
                        Clock Out
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                  <button
                    onClick={() => handleBreak(staffInfo?.is_on_break ? 'end' : 'start', 'lunch')}
                    disabled={!staffInfo || loading || !(staffInfo?.is_clocked_in ?? false)}
                    className={`h-[46px] sm:h-[54px] rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 sm:gap-2 transition-all touch-manipulation disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98] ${
                      staffInfo?.is_on_break
                        ? 'bg-amber-500 text-white hover:bg-amber-500/90'
                        : 'bg-amber-50 text-amber-700 border-2 border-amber-200 hover:bg-amber-100'
                    }`}
                  >
                    {loading ? (
                      <div className={`w-4 h-4 border-2 border-t-transparent rounded-full animate-spin ${staffInfo?.is_on_break ? 'border-white' : 'border-amber-700'}`} />
                    ) : (
                      <>
                        <UtensilsCrossed className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        {staffInfo?.is_on_break ? 'End Lunch' : 'Lunch'}
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleBreak(staffInfo?.is_on_break ? 'end' : 'start', 'break')}
                    disabled={!staffInfo || loading || !(staffInfo?.is_clocked_in ?? false)}
                    className={`h-[46px] sm:h-[54px] rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 sm:gap-2 transition-all touch-manipulation disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98] ${
                      staffInfo?.is_on_break
                        ? 'bg-sky-500 text-white hover:bg-sky-500/90'
                        : 'bg-sky-50 text-sky-700 border-2 border-sky-200 hover:bg-sky-100'
                    }`}
                  >
                    {loading ? (
                      <div className={`w-4 h-4 border-2 border-t-transparent rounded-full animate-spin ${staffInfo?.is_on_break ? 'border-white' : 'border-sky-700'}`} />
                    ) : (
                      <>
                        <Coffee className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        {staffInfo?.is_on_break ? 'End Break' : 'Break'}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 sm:mt-5 flex items-center justify-center gap-4">
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

        </div>
      </main>
    </div>
  );
}
