export function formatHM(mins: number): string {
  if (mins <= 0) return '0:00';
  const h = Math.floor(mins / 60);
  const m = Math.floor(mins % 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function formatHMFromHours(hours: number): string {
  return formatHM(hours * 60);
}
