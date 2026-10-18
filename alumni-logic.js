// Shared helpers for the alumni feature (used by admin.js and alumni-public.js).
export const PHOTO_BASE = 'Site_Images/Team_Members/LegacyTeam/';

// Accepts "Pres2025.png", "Site_Images/Team_Members/LegacyTeam/Pres2025.png" or a full https:// link.
export function cleanPhotoPath(p) {
    let s = String(p || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
    if (s.toLowerCase().startsWith(PHOTO_BASE.toLowerCase())) s = s.slice(PHOTO_BASE.length);
    return s;
}

// Returns a safe image URL, or '' if the path is not allowed.
export function photoSrc(path) {
    const p = cleanPhotoPath(path);
    if (!p) return '';
    if (/^https:\/\//i.test(p)) return p;
    if (/^[a-z][a-z0-9+.-]*:/i.test(p)) return '';
    if (p.split('/').includes('..') || !/^[\w\-./ ()]+$/.test(p)) return '';
    return PHOTO_BASE + p.split('/').map(encodeURIComponent).join('/');
}

export const safeLink = (u) => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '');

// "2025-26" / "2025 – 26" -> "2025–26"
export const normYear = (y) => String(y || '').trim().replace(/\s*[-–—]\s*/, '–');
export const validYear = (y) => /^\d{4}(–\d{2,4})?$/.test(normYear(y));
export const yearKey = (y) => { const m = /\d{4}/.exec(String(y || '')); return m ? Number(m[0]) : 0; };

export function initials(name) {
    const w = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!w.length) return '?';
    return (w[0][0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
}

// Newest year first, then by order, then by name.
export function sortAlumni(list) {
    return [...list].sort((a, b) =>
        yearKey(b.year) - yearKey(a.year) ||
        (a.order ?? 9999) - (b.order ?? 9999) ||
        String(a.name).localeCompare(String(b.name)));
}