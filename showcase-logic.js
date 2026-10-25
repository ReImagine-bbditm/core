// Small helpers for the showcase, shared by the public page (showcase.js) and the admin page (admin.js).
// No Firebase code here.

// Showcase screenshots can live in the website repo. A path typed below this folder is completed with it;
// a full https:// link, or a path starting with ./, / or Site_Images/, is used as it is.
export const SHOWCASE_DIR = 'Site_Images/Showcase_Images/';

// Only normal web links (blocks javascript: and similar).
export function webLink(u) {
  try {
    const x = new URL(String(u || '').trim());
    return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : '';
  } catch (e) {
    return '';
  }
}

// What gets stored for an image: tidy slashes, no leading ./ and no repeated folder prefix.
export function cleanImagePath(p) {
  let s = String(p || '').trim().replace(/\\/g, '/');
  if (s.startsWith('./')) s = s.slice(2);
  if (s.startsWith(SHOWCASE_DIR)) s = s.slice(SHOWCASE_DIR.length);
  return s;
}

// The address an <img> can load, or '' when it is not allowed.
export function imageSrc(p) {
  const s = String(p || '').trim().replace(/\\/g, '/');
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return webLink(s);
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith('//')) return '';
  if (/(^|\/)\.\.(\/|$)/.test(s)) return '';
  if (s.startsWith('/') || s.startsWith('./') || s.startsWith('Site_Images/')) return s;
  return SHOWCASE_DIR + s;
}

export function slugify(s) {
  return String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/g, '');
}

// "Gemma 4, Open-source AI" -> ['Gemma 4', 'Open-source AI'] (also accepts an array)
export function tagsOf(v) {
  const list = Array.isArray(v) ? v : String(v || '').split(',');
  const seen = new Set();
  return list.map((t) => String(t).trim()).filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
}

// Items with an order number come first (1, 2, 3...), the rest after them, then by title.
export function sortByOrder(list) {
  const key = (p) => (Number.isFinite(p.order) ? p.order : 1e9);
  return list.slice().sort((a, b) => key(a) - key(b) || String(a.title).localeCompare(String(b.title)));
}