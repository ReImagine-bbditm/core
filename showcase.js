// Showcase page. Shows projects grouped by event ("section"), saved in the admin page (Showcase tab).
// If Firebase is not set up, is empty, or cannot be reached, seed-showcase.json is shown instead
// so the page never goes blank. Built with textContent, never innerHTML.
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig, configured } from './firebase-config.js';
import { imageSrc, webLink, tagsOf, sortByOrder } from './showcase-logic.js';

const WAIT_FOR_DB = 3000; // slower than this: show the built-in copy
const $ = (id) => document.getElementById(id);

function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else n.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c) n.append(c);
  return n;
}

async function fromDb() {
  if (!configured) return null;
  try {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const db = getFirestore(app);
    // Visitors may only read published items (see firestore.rules), so ask for exactly those.
    const pub = (name) => getDocs(query(collection(db, name), where('status', '==', 'published')));
    const [s, p] = await Promise.all([pub('showcaseSections'), pub('showcase')]);
    return {
      sections: s.docs.map((d) => ({ id: d.id, ...d.data() })),
      projects: p.docs.map((d) => ({ id: d.id, ...d.data() })),
    };
  } catch (e) {
    console.warn('Could not load the showcase from Firebase; showing the built-in copy.', e);
    return null;
  }
}

async function fromSeed() {
  const res = await fetch('./seed-showcase.json');
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

function card(p) {
  const mono = el('div', { class: 'sc-mono', 'aria-hidden': 'true', text: (String(p.title).match(/[A-Za-z0-9]/) || ['?'])[0].toUpperCase() });
  const shot = el('div', { class: 'sc-shot' }, p.award ? el('span', { class: 'sc-ribbon', text: p.award }) : null, mono);
  const src = imageSrc(p.image);
  if (src) {
    const img = el('img', { src, alt: p.title + ' screenshot', loading: 'lazy', referrerpolicy: 'no-referrer' });
    img.onload = () => mono.remove();
    img.onerror = () => img.remove();
    shot.append(img);
  }
  const demo = webLink(p.demo), repo = webLink(p.repo), page = webLink(p.page);
  return el('article', { class: 'sc-card' + (p.award ? ' win' : '') }, shot,
    el('div', { class: 'sc-body' },
      el('h4', { text: p.title }),
      p.description ? el('p', { class: 'sc-desc', text: p.description }) : null,
      p.team ? el('p', { class: 'sc-team', text: p.team }) : null,
      tagsOf(p.tags).length ? el('ul', { class: 'sc-tags' }, tagsOf(p.tags).map((t) => el('li', { text: t }))) : null,
      (demo || repo || page) ? el('div', { class: 'sc-links' },
        demo ? el('a', { class: 'demo', href: demo, target: '_blank', rel: 'noopener noreferrer', text: p.demoLabel || 'Demo' }) : null,
        repo ? el('a', { href: repo, target: '_blank', rel: 'noopener noreferrer', text: 'Code' }) : null,
        page ? el('a', { href: page, target: '_blank', rel: 'noopener noreferrer', text: 'Details' }) : null) : null));
}

let entries = [];   // { p, card, sec }
let sections = [];  // { box, count }
let filter = 'all', needle = '';

function apply() {
  let shown = 0;
  for (const e of entries) {
    const okFilter = filter === 'all' || (filter === '\u0000winners' ? !!e.p.award : tagsOf(e.p.tags).includes(filter));
    const ok = okFilter && (!needle || (e.p.title + ' ' + (e.p.team || '') + ' ' + (e.p.description || '')).toLowerCase().includes(needle));
    e.card.hidden = !ok;
    if (ok) shown++;
  }
  for (const s of sections) s.box.hidden = !entries.some((e) => e.sec === s && !e.card.hidden);
  $('sc-none').hidden = shown > 0;
  $('sc-count').textContent = shown === entries.length ? '' : 'Showing ' + shown + ' of ' + entries.length + ' projects';
}

function build(data) {
  const wanted = new Set(data.sections.map((s) => s.id));
  const secs = sortByOrder(data.sections);
  const shownSecs = secs.filter((s) => data.projects.some((p) => p.section === s.id));
  entries = []; sections = [];

  $('sc-list').replaceChildren(...shownSecs.map((s) => {
    const projects = sortByOrder(data.projects.filter((p) => p.section === s.id && wanted.has(p.section)));
    const grid = el('div', { class: 'sc-grid' });
    const link = webLink(s.link);
    const box = el('section', { class: 'sc-section', id: s.id },
      el('h3', { text: s.title }),
      (s.blurb || link) ? el('p', { class: 'sc-blurb' }, s.blurb || '',
        link ? [s.blurb ? ' ' : '', el('a', { href: link, target: '_blank', rel: 'noopener noreferrer', text: s.linkLabel || 'Read more' })] : null) : null,
      grid);
    const sec = { box };
    sections.push(sec);
    for (const p of projects) { const c = card(p); grid.append(c); entries.push({ p, card: c, sec }); }
    return box;
  }));

  $('sc-sections').replaceChildren(...(shownSecs.length > 1
    ? shownSecs.map((s) => el('a', { href: '#' + s.id, text: s.title })) : []));

  const tags = [];
  for (const e of entries) for (const t of tagsOf(e.p.tags)) if (!tags.includes(t)) tags.push(t);
  const chips = [['all', 'All projects']];
  if (entries.some((e) => e.p.award)) chips.push(['\u0000winners', 'Winners']);
  for (const t of tags) chips.push([t, t]);
  filter = 'all';
  $('sc-filters').replaceChildren(...(chips.length > 1 ? chips.map(([key, label]) => {
    const b = el('button', { type: 'button', 'aria-pressed': String(key === filter), text: label });
    b.onclick = () => {
      filter = key;
      for (const x of $('sc-filters').children) x.setAttribute('aria-pressed', String(x === b));
      apply();
    };
    return b;
  }) : []));
  apply();
  if (window.ReImagine) window.ReImagine.refresh($('sc-list'));
  if (location.hash.length > 1) {
    const t = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (t) t.scrollIntoView();
  }
}

async function start() {
  $('sc-q').addEventListener('input', (e) => { needle = e.target.value.trim().toLowerCase(); apply(); });
  const live = await Promise.race([fromDb(), new Promise((r) => setTimeout(() => r(null), WAIT_FOR_DB))]);
  let data = live && live.sections.length && live.projects.length ? live : null;
  if (!data) {
    try { data = await fromSeed(); } catch (e) { $('sc-count').textContent = 'Could not load the projects. Please try again later.'; return; }
  }
  build(data);
}
start();