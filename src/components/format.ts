const DAY = 86_400_000;
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function startOfDay(ms: number) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function dayDiff(ms: number, now = Date.now()) {
  return Math.round((startOfDay(ms) - startOfDay(now)) / DAY);
}

export function time(ms: number) {
  const d = new Date(ms);
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}`;
}

export function shortDate(ms: number) {
  const d = new Date(ms);
  return `${MONTH[d.getMonth()]} ${d.getDate()}`;
}

export function weekdayDate(ms: number) {
  return `${WEEKDAY[new Date(ms).getDay()]}, ${shortDate(ms)}`;
}

export function fullDate(ms: number) {
  const d = new Date(ms);
  const long = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return `${long[d.getDay()]}, ${shortDate(ms)}`;
}

export function weekday(ms: number) {
  return WEEKDAY[new Date(ms).getDay()];
}

export function relativeDay(ms: number, now = Date.now()) {
  const diff = dayDiff(ms, now);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  if (diff > 1 && diff < 7) return WEEKDAY[new Date(ms).getDay()];
  if (diff < -1 && diff > -7) return WEEKDAY[new Date(ms).getDay()];
  return shortDate(ms);
}

export function daysSince(ms: number, now = Date.now()) {
  return Math.max(0, -dayDiff(ms, now));
}

export function firstName(name: string) {
  return name.split(' ')[0];
}

export function localDateKey(ms = Date.now()) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
