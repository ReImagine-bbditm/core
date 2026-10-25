// Small helpers for the gallery, shared by the home page (gallery.js) and the admin page (admin.js).
// No Firebase code here.

// Gallery photos live in the website repo (served by Vercel), so the database stores only their paths.
// A path typed below this folder is completed with it; a full https:// link, or a path that already
// starts with ./, / or Site_Images/, is used as it is.
export const GALLERY_DIR = 'Site_Images/Events_Images/';

function safeHttp(u) {
  try {
    const x = new URL(String(u || '').trim());
    return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : '';
  } catch (e) {
    return '';
  }
}

// What gets stored: tidy slashes, no leading ./ and no repeated folder prefix.
export function cleanGalleryPath(p) {
  let s = String(p || '').trim().replace(/\\/g, '/');
  if (s.startsWith('./')) s = s.slice(2);
  if (s.startsWith(GALLERY_DIR)) s = s.slice(GALLERY_DIR.length);
  return s;
}

// The address an <img> can load, or '' when the path is not allowed (blocks javascript:, data: and the like).
export function gallerySrc(p) {
  const s = String(p || '').trim().replace(/\\/g, '/');
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return safeHttp(s);
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith('//')) return '';
  if (/(^|\/)\.\.(\/|$)/.test(s)) return '';
  if (s.startsWith('/') || s.startsWith('./') || s.startsWith('Site_Images/')) return s;
  return GALLERY_DIR + s;
}

// Photos with an order number come first (1, 2, 3...), the rest after them, then by file name.
export function sortPhotos(list) {
  const key = (p) => (Number.isFinite(p.order) ? p.order : 1e9);
  return list.slice().sort((a, b) => key(a) - key(b) || String(a.image).localeCompare(String(b.image)));
}