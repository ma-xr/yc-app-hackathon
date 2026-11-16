const DAY = 86_400_000;
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function monthDay(month: number, day: number) {
  return `${MONTH[month - 1]} ${day}`;
}

export function shortDate(ms: number, now = Date.now()) {
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return `${MONTH[d.getMonth()]} ${d.getDate()}${sameYear ? '' : `, ${d.getFullYear()}`}`;
}

export function monthYear(ms: number) {
  const d = new Date(ms);
  return `${MONTH[d.getMonth()]} ${d.getFullYear()}`;
}

export function monthKey(ms: number) {
  const d = new Date(ms);
  return `${MONTH_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

export function weekdayDate(ms: number) {
  const d = new Date(ms);
  return `${WEEKDAY[d.getDay()]} ${MONTH[d.getMonth()]} ${d.getDate()}`;
}

export function relativeAgo(ms: number, now = Date.now()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const days = Math.max(0, Math.ceil((start.getTime() - ms) / DAY));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.round(days / 7)}w ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

export function hours(minutes: number) {
  const h = minutes / 60;
  if (h < 10) return `${Math.round(h * 10) / 10}h`;
  return `${Math.round(h)}h`;
}

export function duration(minutes: number) {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function inDays(days: number) {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}
