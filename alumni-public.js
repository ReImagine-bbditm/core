// Renders the past members page from Firestore. If nothing is published yet (or Firestore
// is unreachable), the hand-written cards already in the page stay as they are.
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig, configured } from './firebase-config.js';
import { photoSrc, safeLink, initials, sortAlumni } from './alumni-logic.js';

const root = document.getElementById('alumni-root');
if (root && configured) load();

function h(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
}

function card(a) {
    const box = h('div', 'box');
    const avatar = h('div', 'card-image-container avatar ph');
    const src = photoSrc(a.photo);
    if (src) {
        const img = document.createElement('img');
        img.src = src; img.alt = ''; img.loading = 'lazy';
        img.onerror = () => { avatar.replaceChildren(initials(a.name)); };
        avatar.append(img);
    } else {
        avatar.textContent = initials(a.name);
    }
    const intro = h('div', 'intro');
    intro.append(h('h3', 'card-name', a.name), h('p', 'card-designation', a.role));
    const link = safeLink(a.linkedin);
    if (link) {
        const x = h('a', 'card-linkedin');
        x.href = link; x.target = '_blank'; x.rel = 'noopener';
        x.setAttribute('aria-label', a.name + ' on LinkedIn');
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '24'); svg.setAttribute('height', '24');
        svg.setAttribute('fill', 'currentColor'); svg.setAttribute('aria-hidden', 'true');
        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        use.setAttribute('href', '#icon-linkedin');
        svg.append(use); x.append(svg); intro.append(x);
    }
    box.append(avatar, intro);
    return box;
}

async function load() {
    try {
        const db = getFirestore(getApps().length ? getApp() : initializeApp(firebaseConfig));
        const snap = await getDocs(query(collection(db, 'alumni'), where('status', '==', 'published')));
        const list = sortAlumni(snap.docs.map((d) => d.data()).filter((a) => a.name && a.year && a.role));
        if (!list.length) return;

        const years = [];
        for (const a of list) if (!years.includes(a.year)) years.push(a.year);
        const out = [];
        for (const y of years) {
            const grid = h('div', 'container team-grid compact');
            grid.append(...list.filter((a) => a.year === y).map(card));
            out.push(h('h3', 'year-heading', y), grid);
        }
        root.replaceChildren(...out);
    } catch (e) {
        console.warn('Could not load alumni, showing the built-in list.', e);
    }
}