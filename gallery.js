// Home page gallery. Shows a few photos at a time (TILES) and, when the collection is bigger,
// swaps one tile for the next photo every few seconds, so the whole collection gets shown over time.
// The collection is managed in the admin page (Gallery tab). If Firebase is not set up, the collection
// is empty, or it cannot be reached, the photos written in index.html are used instead,
// so the section never goes blank.
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig, configured } from './firebase-config.js';
import { gallerySrc, sortPhotos } from './gallery-logic.js';

const TILES = 12;          // photos on screen at once
const INTERVAL = 3500;    // milliseconds between swaps (one tile at a time)
const FADE = 500;         // milliseconds each photo takes to fade out and back in
const WAIT_FOR_DB = 2500; // if the database is slower than this, the photos in index.html are used

const grid = document.querySelector('#Gallery .container');
if (grid) start();

async function loadFromDb() {
  if (!configured) return [];
  try {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const snap = await getDocs(query(collection(getFirestore(app), 'gallery'), where('status', '==', 'published')));
    return sortPhotos(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      .map((p) => ({ src: gallerySrc(p.image), alt: p.caption || '' }))
      .filter((p) => p.src);
  } catch (e) {
    console.warn('Could not load the gallery from Firebase; showing the built-in photos.', e);
    return [];
  }
}

async function start() {
  const first = grid.querySelector('.box');
  if (!first) return;
  const template = first.cloneNode(true);
  // The photos already written in index.html: used when the database has none.
  const fallback = [...grid.querySelectorAll('.tile img')]
    .map((i) => ({ src: i.getAttribute('src'), alt: i.getAttribute('alt') || '' }))
    .filter((p) => p.src);

  const fromDb = await Promise.race([loadFromDb(), new Promise((r) => setTimeout(() => r(null), WAIT_FOR_DB))]);
  const pool = fromDb && fromDb.length ? fromDb : fallback;
  if (pool.length) build(pool, template);
}

function build(pool, template) {
  const n = Math.min(TILES, pool.length);
  const tiles = [];
  grid.replaceChildren();
  for (let i = 0; i < n; i++) {
    const box = template.cloneNode(true);
    box.classList.remove('reveal', 'in');     // the scroll animation is applied again below
    box.style.removeProperty('--d');
    let img = box.querySelector('img');
    if (!img) {
      img = document.createElement('img');
      (box.querySelector('.tile') || box).append(img);
    }
    img.setAttribute('loading', 'lazy');
    img.src = pool[i].src;
    img.alt = pool[i].alt;
    img.style.transition = `opacity ${FADE}ms ease`;
    grid.append(box);
    tiles.push({ box, img, idx: i });
  }
  if (window.ReImagine) window.ReImagine.refresh(grid);

  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (pool.length > n && !still) rotate(pool, tiles);
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function rotate(pool, tiles) {
  const shown = new Set(tiles.map((t) => t.idx));   // photos on screen now
  const broken = new Set();                         // photos whose file could not be loaded
  let nextPhoto = tiles.length % pool.length;
  let order = [];
  let onScreen = true;
  let busy = false;

  // Do nothing while the gallery is scrolled out of view or the tab is hidden.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => { onScreen = entries[0].isIntersecting; }, { threshold: 0.1 }).observe(grid);
  }

  function pickTile() {
    if (!order.length) order = shuffle(tiles.map((_, i) => i));   // every tile gets a turn before any repeats
    return tiles[order.pop()];
  }

  function pickPhoto() {
    for (let k = 0; k < pool.length; k++) {
      const i = (nextPhoto + k) % pool.length;
      if (!shown.has(i) && !broken.has(i)) { nextPhoto = (i + 1) % pool.length; return i; }
    }
    return -1;
  }

  function tick() {
    if (busy || !onScreen || document.hidden) return;
    const tile = pickTile();
    // Leave a tile alone while someone points at it or has keyboard focus inside it.
    if (tile.box.matches(':hover') || tile.box.contains(document.activeElement)) return;
    const i = pickPhoto();
    if (i < 0) return;
    busy = true;
    const pre = new Image();                        // load the next photo first so the tile never goes blank
    pre.onload = () => {
      tile.img.style.opacity = '0';
      setTimeout(() => {
        shown.delete(tile.idx); shown.add(i); tile.idx = i;
        tile.img.src = pool[i].src;
        tile.img.alt = pool[i].alt;
        tile.img.style.opacity = '1';
        busy = false;
      }, FADE);
    };
    pre.onerror = () => { broken.add(i); busy = false; };
    pre.src = pool[i].src;
  }

  setInterval(tick, INTERVAL);
}