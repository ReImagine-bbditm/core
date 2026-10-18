// Loads published events from Firebase and fills three places on the public site:
//   #upcoming-list  (index.html)        the featured card(s) for events that have not finished
//   #recent-list    (index.html)        the newest few finished events, linking to pastEvents.html
//   #past-list      (pastEvents.html)   every finished event, grouped by year
// Upcoming vs past is decided here, in the visitor's browser, by comparing each event's end time
// with the current time, so nothing has to be moved by hand.
// If Firebase is not set up or cannot be reached, the events already written in the HTML stay.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig, configured } from './firebase-config.js';
import {
  splitEvents, RECENT_COUNT, formatDate, formatTimeRange, imageSrc, safeUrl, listOf,
} from './event-logic.js';

// Builds elements with textContent, never innerHTML, so event text can't inject HTML.
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

const pageLink = (ev) => (ev.slug ? `./pastEvents.html#${encodeURIComponent(ev.slug)}` : './pastEvents.html');
const imagesOf = (ev) => listOf(ev.images).map(imageSrc).filter(Boolean);

// First sentence of the description, used on the home page when an event has no one-line summary.
function shortText(ev) {
  if (ev.summary) return ev.summary;
  const d = String(ev.description || '');
  const m = d.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : d).trim();
}

// ---------- home page ----------

function upcomingCard(ev) {
  const imgs = imagesOf(ev);
  const facts = listOf(ev.facts).filter((f) => f && f.label && f.value);
  const primary = safeUrl(ev.registerUrl);
  const secondary = safeUrl(ev.secondaryUrl);
  const buttons = [
    primary ? el('a', {
      class: 'btn btn-primary', href: primary, target: '_blank', rel: 'noopener noreferrer',
      text: ev.registerLabel || 'Register',
    }) : null,
    secondary ? el('a', {
      class: 'btn btn-secondary', href: secondary, target: '_blank', rel: 'noopener noreferrer',
      text: ev.secondaryLabel || 'Learn more',
    }) : null,
  ].filter(Boolean);

  return el('article', { class: 'event-card featured' },
    imgs.length ? el('div', { class: 'event-card-img' }, el('img', { src: imgs[0], alt: ev.title, loading: 'lazy' })) : null,
    el('div', { class: 'event-card-body' },
      el('h4', { text: ev.title }),
      el('p', { class: 'event-card-meta' },
        el('span', { class: 'date', text: formatDate(ev) }),
        ev.venue ? el('span', { class: 'venue', text: ev.venue }) : null),
      (ev.description || ev.summary) ? el('p', { class: 'event-card-desc', text: ev.description || ev.summary }) : null,
      facts.length ? el('ul', { class: 'event-card-facts' },
        facts.map((f) => el('li', {}, el('strong', { text: f.label }), f.value))) : null,
      buttons.length ? el('div', { class: 'button-div' }, buttons) : null));
}

function recentCard(ev) {
  const imgs = imagesOf(ev);
  const text = shortText(ev);
  return el('a', { class: 'event-card side', href: pageLink(ev) },
    imgs.length ? el('div', { class: 'event-card-img' }, el('img', { src: imgs[0], alt: '', loading: 'lazy' })) : null,
    el('div', { class: 'event-card-body' },
      el('h4', { text: ev.title }),
      el('p', { class: 'event-card-meta' },
        el('span', { class: 'date', text: formatDate(ev) }),
        ev.venue ? el('span', { class: 'venue', text: ev.venue }) : null),
      text ? el('p', { class: 'event-card-summary', text }) : null));
}

// ---------- past events page ----------

function pastItem(ev) {
  const imgs = imagesOf(ev);
  const hl = listOf(ev.highlights);
  const text = ev.description || ev.summary;
  const time = formatTimeRange(ev);

  const image = imgs.length
    ? el('div', { class: 'pe-image' }, imgs.map((src, i) => el('img', { src, alt: `${ev.title}, photo ${i + 1}`, loading: 'lazy' })))
    : el('div', { class: 'pe-image', role: 'img', 'aria-label': 'Image placeholder', text: 'Image' });

  const meta = el('dl', { class: 'pe-meta' },
    el('dt', { text: 'Date' }), el('dd', { text: formatDate(ev) }),
    time ? el('dt', { text: 'Time' }) : null, time ? el('dd', { text: time }) : null,
    ev.venue ? el('dt', { text: 'Venue' }) : null, ev.venue ? el('dd', { text: ev.venue }) : null);

  return el('article', { class: 'pe-item', id: ev.slug || null },
    image,
    el('div', { class: 'pe-body' },
      el('h3', { text: ev.title }),
      meta,
      text ? el('p', { text }) : null,
      hl.length ? [el('h4', { text: 'Highlights' }), el('ul', {}, hl.map((t) => el('li', { text: t })))] : null));
}

function pastGroups(past) {
  const byYear = new Map(); // past is already newest first, so years come out newest first too
  for (const ev of past) {
    const y = ev.date.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(ev);
  }
  const out = [];
  for (const [year, list] of byYear) {
    out.push(el('h3', { class: 'pe-year', text: year }));
    out.push(el('div', { class: 'pe-group' }, list.map(pastItem)));
  }
  return out;
}

// ---------- fill the page ----------

function render(events) {
  const { upcoming, past } = splitEvents(events, new Date());
  const touched = [];

  const up = document.getElementById('upcoming-list');
  if (up) {
    up.replaceChildren(...(upcoming.length
      ? upcoming.map(upcomingCard)
      : [el('p', { class: 'section-note left', text: 'No events announced yet. Follow our social pages for updates.' })]));
    touched.push(up);
  }

  const recent = document.getElementById('recent-list');
  if (recent) {
    recent.replaceChildren(...past.slice(0, RECENT_COUNT).map(recentCard));
    touched.push(recent);
  }

  const all = document.getElementById('past-list');
  if (all) {
    all.replaceChildren(...(past.length
      ? pastGroups(past)
      : [el('p', { class: 'section-note left', text: 'No past events yet.' })]));
    touched.push(all);
  }

  // Let app.js animate the new cards and build the photo carousels.
  if (window.ReImagine) touched.forEach((n) => window.ReImagine.refresh(n));

  // The browser tried to jump to #some-event before these cards existed, so jump again now.
  if (all && location.hash.length > 1) {
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) target.scrollIntoView();
  }
}

async function load() {
  if (!configured) return; // not set up yet: keep the events written in the HTML
  if (!document.getElementById('upcoming-list') && !document.getElementById('recent-list') && !document.getElementById('past-list')) return;
  try {
    const db = getFirestore(initializeApp(firebaseConfig));
    // Visitors may only read published events (see firestore.rules), so ask for exactly those.
    const snap = await getDocs(query(collection(db, 'events'), where('status', '==', 'published')));
    const events = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (events.length) render(events); // empty database: keep the built-in list
  } catch (e) {
    console.warn('Could not load events from Firebase; showing the built-in list.', e);
  }
}

load();