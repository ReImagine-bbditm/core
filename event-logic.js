// Pure helpers shared by the public pages (events.js) and the admin page (admin.js).
// No Firebase code here, so the date rules are easy to read and test.

// Category values. Keep in sync with firestore.rules.
export const TYPES = {
  'workshop': 'Workshop',
  'industrial-visit': 'Industrial Visit',
  'tech-event': 'Tech Events',
  'guest-lecture': 'Guest Lecture',
  'alumni-talk': 'Alumni Talk',
  'career-guidance': 'Career Guidance',
  'other': 'Other',
};

// How many past events the home page shows under "Recent events".
export const RECENT_COUNT = 4;

// Event photos live in the website repo (served by Vercel), so the database stores only their paths.
// Paths are written relative to this folder; a full https:// link or a ./ path is used as it is.
export const IMAGE_DIR = './Site_Images/Events_Images/';

// All event times are entered and compared in India time.
const IST = '+05:30';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

// Event shape:
// { title, type, date: 'YYYY-MM-DD', startTime: 'HH:MM' | '', endTime: 'HH:MM' | '', venue,
//   summary (one line, shown on home-page cards), description (full paragraph), highlights: [],
//   images: [paths, first one is the cover], facts: [{label, value}] (shown on upcoming cards),
//   registerLabel, registerUrl, secondaryLabel, secondaryUrl, slug (the #link on the past events page),
//   status: 'draft' | 'published' }

export function startOf(ev) {
  return new Date(`${ev.date}T${ev.startTime || '00:00'}:00${IST}`);
}

// With no end time the event counts as running until the end of its day.
export function endOf(ev) {
  return new Date(`${ev.date}T${ev.endTime || '23:59'}:59${IST}`);
}

export function isValid(ev) {
  return !!(ev && ev.date && !isNaN(startOf(ev)) && !isNaN(endOf(ev)));
}

// Upcoming = not finished yet (so an event happening right now is still "upcoming").
// Past = already finished. Upcoming is soonest first; past is newest first.
export function splitEvents(list, now = new Date()) {
  const valid = list.filter(isValid);
  const upcoming = valid.filter((e) => endOf(e) >= now).sort((a, b) => startOf(a) - startOf(b));
  const past = valid.filter((e) => endOf(e) < now).sort((a, b) => startOf(b) - startOf(a));
  return { upcoming, past };
}

export function formatTime(t) {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

// "15 May 2025"
export function formatDate(ev) {
  const [y, m, d] = ev.date.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// "3:00 to 5:00 PM", "9:00 AM to 5:00 PM", "10:00 AM onwards", or '' when no start time is set.
export function formatTimeRange(ev) {
  if (!ev.startTime) return '';
  const a = formatTime(ev.startTime);
  if (!ev.endTime) return `${a} onwards`;
  const b = formatTime(ev.endTime);
  return `${a.split(' ')[1] === b.split(' ')[1] ? a.split(' ')[0] : a} to ${b}`;
}

// "15 May 2025, 3:00 to 5:00 PM · Online"
export function formatMeta(ev) {
  let s = formatDate(ev);
  const t = formatTimeRange(ev);
  if (t) s += `, ${t}`;
  if (ev.venue) s += ` · ${ev.venue}`;
  return s;
}

// Only allow normal web links in buttons (blocks javascript: links).
export function safeUrl(u) {
  try {
    const x = new URL(String(u || '').trim());
    return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : '';
  } catch (e) {
    return '';
  }
}

// Turns what a member typed into the path the <img> uses. Blocks javascript:, data: and similar.
export function imageSrc(p) {
  const s = String(p || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return safeUrl(s);
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return '';
  if (s.startsWith('./') || s.startsWith('/')) return s;
  return IMAGE_DIR + s;
}

// Stored form of an image path: drop the common folder prefix so members can type short paths.
export function cleanImagePath(p) {
  const s = String(p || '').trim();
  return s.startsWith(IMAGE_DIR) ? s.slice(IMAGE_DIR.length) : s;
}

export function slugify(s) {
  return String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/g, '');
}

export function listOf(v) {
  return Array.isArray(v) ? v.filter(Boolean) : [];
}