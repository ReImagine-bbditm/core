// Members-only admin page: Google sign-in, add/edit/delete events, alumni and gallery photos, manage the members list.
// The real security is in firestore.rules. This page only decides what to show.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc, deleteDoc, writeBatch, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig, configured } from './firebase-config.js';
import {
  TYPES, startOf, endOf, isValid, formatMeta, safeUrl, imageSrc, cleanImagePath, slugify, listOf,
} from './event-logic.js';
import {
  cleanPhotoPath, photoSrc, safeLink, normYear, validYear, sortAlumni,
} from './alumni-logic.js';
import { cleanGalleryPath, gallerySrc, sortPhotos } from './gallery-logic.js';
import { cleanImagePath as cleanShotPath, imageSrc as shotSrc, webLink, tagsOf, sortByOrder } from './showcase-logic.js';

const $ = (id) => document.getElementById(id);

function show(view) {
  for (const v of ['view-setup', 'view-signin', 'view-denied', 'view-app']) $(v).hidden = v !== view;
}

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

function say(id, text, ok) {
  const n = $(id);
  n.textContent = text;
  n.className = 'adm-msg' + (text ? (ok ? ' ok' : ' err') : '');
}

const lines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);

// "Time: 10 AM to 5 PM" -> { label: 'Time', value: '10 AM to 5 PM' }; returns null for a line without a colon
function parseFact(line) {
  const i = line.indexOf(':');
  if (i < 1) return null;
  const label = line.slice(0, i).trim();
  const value = line.slice(i + 1).trim();
  return label && value ? { label, value } : null;
}

if (!configured) {
  show('view-setup');
} else {
  start();
}

function start() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  let me = { email: '', admin: false };
  let events = [];
  let editingId = null;
  let alumni = [];
  let editingAlumniId = null;
  let gallery = [];
  let editingGalleryId = null;
  let showSections = [];
  let showProjects = [];
  let editingSectionId = null;
  let editingProjectId = null;

  // ---------- sign in / out ----------
  $('signin').onclick = async () => {
    say('signin-msg', '');
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) {
      say('signin-msg', 'Sign-in failed (' + (e.code || e.message) + '). If this says "unauthorized-domain", add this site\'s address under Authentication > Settings > Authorized domains.');
    }
  };
  $('signout').onclick = $('denied-signout').onclick = () => signOut(auth);

  onAuthStateChanged(auth, async (user) => {
    $('signout').hidden = !user;
    $('who').textContent = user ? user.email : '';
    if (!user) { show('view-signin'); return; }

    const email = (user.email || '').toLowerCase();
    try {
      const snap = await getDoc(doc(db, 'members', email));
      if (!snap.exists()) { $('denied-email').textContent = email; show('view-denied'); return; }
      me = { email, admin: snap.data().role === 'admin' };
    } catch (e) {
      $('denied-email').textContent = email;
      show('view-denied');
      return;
    }

    $('tab-members-btn').hidden = !me.admin;
    show('view-app');
    await loadEvents();
    await loadAlumni();
    await loadGallery();
    await loadShowcase();
    if (me.admin) await loadMembers();
  });

  // ---------- tabs ----------
  function tab(name) {
    $('tab-events').hidden = name !== 'events';
    $('tab-alumni').hidden = name !== 'alumni';
    $('tab-gallery').hidden = name !== 'gallery';
    $('tab-showcase').hidden = name !== 'showcase';
    $('tab-members').hidden = name !== 'members';
    $('tab-events-btn').classList.toggle('active', name === 'events');
    $('tab-alumni-btn').classList.toggle('active', name === 'alumni');
    $('tab-gallery-btn').classList.toggle('active', name === 'gallery');
    $('tab-showcase-btn').classList.toggle('active', name === 'showcase');
    $('tab-members-btn').classList.toggle('active', name === 'members');
  }
  $('tab-events-btn').onclick = () => tab('events');
  $('tab-alumni-btn').onclick = () => tab('alumni');
  $('tab-gallery-btn').onclick = () => tab('gallery');
  $('tab-showcase-btn').onclick = () => tab('showcase');
  $('tab-members-btn').onclick = () => tab('members');

  // ---------- events ----------
  for (const [value, label] of Object.entries(TYPES)) $('f-type').append(el('option', { value, text: label }));

  async function loadEvents() {
    const snap = await getDocs(collection(db, 'events'));
    events = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter(isValid).sort((a, b) => startOf(b) - startOf(a));
    renderEvents();
  }

  function renderEvents() {
    const now = new Date();
    $('import-card').hidden = events.length > 0;
    $('events-empty').hidden = events.length > 0;
    $('event-list').replaceChildren(...events.map((ev) => {
      let badge;
      if (ev.status !== 'published') badge = el('span', { class: 'badge draft', text: 'Draft' });
      else if (endOf(ev) >= now) badge = el('span', { class: 'badge up', text: 'Upcoming' });
      else badge = el('span', { class: 'badge', text: 'Past' });

      const publish = el('button', { type: 'button', text: ev.status === 'published' ? 'Unpublish' : 'Publish' });
      publish.onclick = () => setStatus(ev, ev.status === 'published' ? 'draft' : 'published');
      const edit = el('button', { type: 'button', text: 'Edit' });
      edit.onclick = () => startEdit(ev);
      const del = el('button', { type: 'button', class: 'danger', text: 'Delete' });
      del.onclick = () => removeEvent(ev);

      return el('div', { class: 'adm-row' },
          badge,
          el('div', { class: 'info' }, el('strong', { text: ev.title }), el('span', { text: formatMeta(ev) })),
          el('div', { class: 'acts' }, edit, publish, del));
    }));
  }

  async function setStatus(ev, status) {
    try {
      await setDoc(doc(db, 'events', ev.id), { status, updatedAt: serverTimestamp(), updatedBy: me.email }, { merge: true });
      await loadEvents();
    } catch (e) {
      say('form-msg', 'Could not change visibility: ' + (e.code || e.message));
    }
  }

  async function removeEvent(ev) {
    if (!confirm('Delete "' + ev.title + '"? This cannot be undone.')) return;
    try {
      await deleteDoc(doc(db, 'events', ev.id));
      if (editingId === ev.id) resetForm();
      await loadEvents();
    } catch (e) {
      say('form-msg', 'Could not delete: ' + (e.code || e.message));
    }
  }

  // Small previews under the photo box, so a mistyped path is obvious before saving.
  function renderPreview() {
    $('f-img-preview').replaceChildren(...lines($('f-images').value).map((p) => {
      const src = imageSrc(cleanImagePath(p));
      if (!src) return el('span', { class: 'adm-thumb bad', text: 'Not allowed: ' + p });
      const img = el('img', { src, alt: p, title: p, loading: 'lazy' });
      const box = el('span', { class: 'adm-thumb' }, img);
      img.onerror = () => { box.className = 'adm-thumb bad'; box.replaceChildren('Not found: ' + p); };
      return box;
    }));
  }
  $('f-images').addEventListener('input', renderPreview);

  function resetForm() {
    editingId = null;
    $('event-form').reset();
    $('f-img-preview').replaceChildren();
    $('form-title').textContent = 'Add an event';
    $('save-btn').textContent = 'Save event';
    $('cancel-edit').hidden = true;
  }

  function startEdit(ev) {
    editingId = ev.id;
    $('f-title').value = ev.title || '';
    $('f-type').value = ev.type || 'workshop';
    $('f-date').value = ev.date || '';
    $('f-start').value = ev.startTime || '';
    $('f-end').value = ev.endTime || '';
    $('f-venue').value = ev.venue || '';
    $('f-summary').value = ev.summary || '';
    $('f-description').value = ev.description || '';
    $('f-highlights').value = listOf(ev.highlights).join('\n');
    $('f-images').value = listOf(ev.images).join('\n');
    $('f-facts').value = listOf(ev.facts).map((f) => f.label + ': ' + f.value).join('\n');
    $('f-reg-label').value = ev.registerLabel || '';
    $('f-url').value = ev.registerUrl || '';
    $('f-sec-label').value = ev.secondaryLabel || '';
    $('f-sec-url').value = ev.secondaryUrl || '';
    $('f-status').value = ev.status || 'published';
    $('f-slug').value = ev.slug || '';
    renderPreview();
    $('form-title').textContent = 'Edit event';
    $('save-btn').textContent = 'Save changes';
    $('cancel-edit').hidden = false;
    say('form-msg', '');
    $('event-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('cancel-edit').onclick = resetForm;

  // The link name must be unique, because it becomes the #anchor on the past events page.
  function pickSlug(d) {
    const typed = slugify($('f-slug').value);
    const taken = (s) => events.some((e) => e.id !== editingId && e.slug === s);
    if (typed) return taken(typed) ? { error: 'Another event already uses the link name "' + typed + '". Choose a different one.' } : { slug: typed };
    const base = slugify(d.title) || 'event';
    return { slug: taken(base) ? slugify(base + '-' + d.date) : base };
  }

  function problem(d) {
    if (!d.title) return 'Please enter a title.';
    if (!d.date) return 'Please choose a date.';
    if (d.startTime && d.endTime && d.endTime <= d.startTime) return 'The end time must be after the start time.';
    if (d.endTime && !d.startTime) return 'Add a start time too, or clear the end time.';
    if (d.registerUrl && !safeUrl(d.registerUrl)) return 'The main button link must start with https:// or http://.';
    if (d.secondaryUrl && !safeUrl(d.secondaryUrl)) return 'The second button link must start with https:// or http://.';
    if (d.registerLabel && !d.registerUrl) return 'The main button needs a link.';
    if (d.secondaryLabel && !d.secondaryUrl) return 'The second button needs a link.';
    for (const p of d.images) if (!imageSrc(p)) return 'This photo path is not allowed: ' + p;
    return '';
  }

  $('event-form').onsubmit = async (e) => {
    e.preventDefault();
    say('form-msg', '');

    const badFact = lines($('f-facts').value).find((l) => !parseFact(l));
    if (badFact) { say('form-msg', 'Each key fact needs the form "Label: value". Check this line: ' + badFact); return; }

    const data = {
      title: $('f-title').value.trim(),
      type: $('f-type').value,
      date: $('f-date').value,
      startTime: $('f-start').value,
      endTime: $('f-end').value,
      venue: $('f-venue').value.trim(),
      summary: $('f-summary').value.trim(),
      description: $('f-description').value.trim(),
      highlights: lines($('f-highlights').value).slice(0, 20),
      images: lines($('f-images').value).map(cleanImagePath).slice(0, 60),
      facts: lines($('f-facts').value).map(parseFact).filter(Boolean).slice(0, 8),
      registerLabel: $('f-reg-label').value.trim(),
      registerUrl: $('f-url').value.trim(),
      secondaryLabel: $('f-sec-label').value.trim(),
      secondaryUrl: $('f-sec-url').value.trim(),
      status: $('f-status').value,
    };
    const err = problem(data);
    if (err) { say('form-msg', err); return; }
    const s = pickSlug(data);
    if (s.error) { say('form-msg', s.error); return; }
    data.slug = s.slug;

    data.updatedAt = serverTimestamp();
    data.updatedBy = me.email;
    $('save-btn').disabled = true;
    try {
      if (editingId) await setDoc(doc(db, 'events', editingId), data, { merge: true });
      else await addDoc(collection(db, 'events'), { ...data, createdAt: serverTimestamp() });
      say('form-msg', data.status === 'published' ? 'Saved. It is live on the site.' : 'Saved as a draft. It is not visible on the site yet.', true);
      resetForm();
      await loadEvents();
    } catch (ex) {
      say('form-msg', 'Could not save: ' + (ex.code || ex.message));
    } finally {
      $('save-btn').disabled = false;
    }
  };

  // ---------- one-time import of the starting events ----------
  $('import-btn').onclick = async () => {
    if (events.length) return;
    $('import-btn').disabled = true;
    say('import-msg', 'Importing...', true);
    try {
      const res = await fetch('./seed-events.json');
      if (!res.ok) throw new Error('seed-events.json not found');
      const list = await res.json();
      // Firestore allows 500 writes per batch; the seed is far below that.
      const batch = writeBatch(db);
      for (const ev of list) {
        batch.set(doc(collection(db, 'events')), {
          ...ev, status: 'published', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: me.email,
        });
      }
      await batch.commit();
      say('import-msg', 'Imported ' + list.length + ' events.', true);
      await loadEvents();
    } catch (e) {
      say('import-msg', 'Import failed: ' + (e.code || e.message));
      $('import-btn').disabled = false;
    }
  };

  // ---------- alumni ----------
  async function loadAlumni() {
    try {
      const snap = await getDocs(collection(db, 'alumni'));
      alumni = sortAlumni(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => a.name && a.year));
      renderAlumni();
    } catch (e) {
      say('alumni-form-msg', 'Could not load past members (' + (e.code || e.message) + '). If this says "permission-denied", add the alumni rule to firestore.rules and publish it.');
    }
  }

  function renderAlumni() {
    $('alumni-import-card').hidden = alumni.length > 0;
    $('alumni-empty').hidden = alumni.length > 0;

    // Suggestions for the Year and Role boxes, built from what is already saved.
    const uniq = (xs) => [...new Set(xs.filter(Boolean))];
    $('a-year-list').replaceChildren(...uniq(alumni.map((a) => a.year)).map((v) => el('option', { value: v })));
    $('a-role-list').replaceChildren(...uniq(alumni.map((a) => a.role)).map((v) => el('option', { value: v })));

    $('alumni-list').replaceChildren(...alumni.map((a) => {
      const draft = a.status !== 'published';
      const publish = el('button', { type: 'button', text: draft ? 'Publish' : 'Unpublish' });
      publish.onclick = () => setAlumniStatus(a, draft ? 'published' : 'draft');
      const edit = el('button', { type: 'button', text: 'Edit' });
      edit.onclick = () => startAlumniEdit(a);
      const del = el('button', { type: 'button', class: 'danger', text: 'Delete' });
      del.onclick = () => removeAlumni(a);
      return el('div', { class: 'adm-row' },
          el('span', { class: 'badge' + (draft ? ' draft' : ''), text: draft ? 'Draft' : a.year }),
          el('div', { class: 'info' }, el('strong', { text: a.name }), el('span', { text: a.role + (draft ? ' · ' + a.year : '') })),
          el('div', { class: 'acts' }, edit, publish, del));
    }));
  }

  async function setAlumniStatus(a, status) {
    try {
      await setDoc(doc(db, 'alumni', a.id), { status, updatedAt: serverTimestamp(), updatedBy: me.email }, { merge: true });
      await loadAlumni();
    } catch (e) {
      say('alumni-form-msg', 'Could not change visibility: ' + (e.code || e.message));
    }
  }

  async function removeAlumni(a) {
    if (!confirm('Delete "' + a.name + '" (' + a.year + ')? This cannot be undone.')) return;
    try {
      await deleteDoc(doc(db, 'alumni', a.id));
      if (editingAlumniId === a.id) resetAlumniForm();
      await loadAlumni();
    } catch (e) {
      say('alumni-form-msg', 'Could not delete: ' + (e.code || e.message));
    }
  }

  function renderAlumniPhoto() {
    const raw = $('a-photo').value.trim();
    if (!raw) { $('a-photo-preview').replaceChildren(); return; }
    const src = photoSrc(raw);
    if (!src) { $('a-photo-preview').replaceChildren(el('span', { class: 'adm-thumb bad', text: 'Not allowed: ' + raw })); return; }
    const img = el('img', { src, alt: raw, title: raw });
    const box = el('span', { class: 'adm-thumb' }, img);
    img.onerror = () => { box.className = 'adm-thumb bad'; box.replaceChildren('Not found: ' + raw); };
    $('a-photo-preview').replaceChildren(box);
  }
  $('a-photo').addEventListener('input', renderAlumniPhoto);

  function resetAlumniForm() {
    editingAlumniId = null;
    $('alumni-form').reset();
    $('a-photo-preview').replaceChildren();
    $('alumni-form-title').textContent = 'Add a past member';
    $('alumni-save-btn').textContent = 'Save';
    $('alumni-cancel-edit').hidden = true;
  }

  function startAlumniEdit(a) {
    editingAlumniId = a.id;
    $('a-name').value = a.name || '';
    $('a-role').value = a.role || '';
    $('a-year').value = a.year || '';
    $('a-order').value = a.order ?? '';
    $('a-status').value = a.status || 'published';
    $('a-photo').value = a.photo || '';
    $('a-linkedin').value = a.linkedin || '';
    renderAlumniPhoto();
    $('alumni-form-title').textContent = 'Edit past member';
    $('alumni-save-btn').textContent = 'Save changes';
    $('alumni-cancel-edit').hidden = false;
    say('alumni-form-msg', '');
    $('alumni-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('alumni-cancel-edit').onclick = resetAlumniForm;

  $('alumni-form').onsubmit = async (e) => {
    e.preventDefault();
    say('alumni-form-msg', '');

    const year = normYear($('a-year').value);
    const photo = cleanPhotoPath($('a-photo').value);
    const linkedin = $('a-linkedin').value.trim();
    const orderRaw = $('a-order').value.trim();
    const data = {
      name: $('a-name').value.trim(),
      role: $('a-role').value.trim(),
      year,
      photo,
      linkedin,
      status: $('a-status').value,
    };

    if (!data.name) { say('alumni-form-msg', 'Please enter a name.'); return; }
    if (!data.role) { say('alumni-form-msg', 'Please enter a role.'); return; }
    if (!validYear(year)) { say('alumni-form-msg', 'The year should look like 2025–26 (or just 2025).'); return; }
    if (photo && !photoSrc(photo)) { say('alumni-form-msg', 'This photo path is not allowed: ' + photo); return; }
    if (linkedin && !safeLink(linkedin)) { say('alumni-form-msg', 'The LinkedIn link must start with https:// or http://.'); return; }
    if (orderRaw && !(Number.isInteger(Number(orderRaw)) && Number(orderRaw) >= 1)) { say('alumni-form-msg', 'Order must be a whole number, 1 or more.'); return; }

    // Empty order = put them last in that year.
    const sameYear = alumni.filter((a) => a.id !== editingAlumniId && a.year === year);
    data.order = orderRaw ? Number(orderRaw) : Math.max(0, ...sameYear.map((a) => a.order || 0)) + 1;

    data.updatedAt = serverTimestamp();
    data.updatedBy = me.email;
    $('alumni-save-btn').disabled = true;
    try {
      if (editingAlumniId) await setDoc(doc(db, 'alumni', editingAlumniId), data, { merge: true });
      else await addDoc(collection(db, 'alumni'), { ...data, createdAt: serverTimestamp() });
      say('alumni-form-msg', data.status === 'published' ? 'Saved. It is live on the site.' : 'Saved as a draft. It is not visible on the site yet.', true);
      resetAlumniForm();
      await loadAlumni();
    } catch (ex) {
      say('alumni-form-msg', 'Could not save: ' + (ex.code || ex.message));
    } finally {
      $('alumni-save-btn').disabled = false;
    }
  };

  // ---------- one-time import of the current past members ----------
  $('alumni-import-btn').onclick = async () => {
    if (alumni.length) return;
    $('alumni-import-btn').disabled = true;
    say('alumni-import-msg', 'Importing...', true);
    try {
      const res = await fetch('./seed-alumni.json');
      if (!res.ok) throw new Error('seed-alumni.json not found');
      const list = await res.json();
      const batch = writeBatch(db);
      for (const a of list) {
        batch.set(doc(collection(db, 'alumni')), {
          ...a, status: 'published', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: me.email,
        });
      }
      await batch.commit();
      say('alumni-import-msg', 'Imported ' + list.length + ' past members.', true);
      await loadAlumni();
    } catch (e) {
      say('alumni-import-msg', 'Import failed: ' + (e.code || e.message));
      $('alumni-import-btn').disabled = false;
    }
  };

  // ---------- gallery ----------
  async function loadGallery() {
    try {
      const snap = await getDocs(collection(db, 'gallery'));
      gallery = sortPhotos(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.image));
      renderGallery();
    } catch (e) {
      say('gallery-form-msg', 'Could not load the gallery (' + (e.code || e.message) + '). If this says "permission-denied", add the gallery rule to firestore.rules and publish it.');
    }
  }

  function renderGallery() {
    $('gallery-import-card').hidden = gallery.length > 0;
    $('gallery-empty').hidden = gallery.length > 0;
    const live = gallery.filter((p) => p.status === 'published').length;
    $('gallery-count').textContent = gallery.length
      ? live + ' of ' + gallery.length + ' photos are published. The home page shows 6 at a time' + (live > 6 ? ' and swaps one every few seconds.' : '.')
      : '';

    $('gallery-list').replaceChildren(...gallery.map((p, i) => {
      const draft = p.status !== 'published';
      const src = gallerySrc(p.image);
      let thumb;
      if (src) {
        thumb = el('img', { class: 'gthumb', src, alt: '', loading: 'lazy' });
        thumb.onerror = () => { thumb.replaceWith(el('span', { class: 'gthumb bad', text: 'Not found' })); };
      } else {
        thumb = el('span', { class: 'gthumb bad', text: 'Not allowed' });
      }
      const up = el('button', { type: 'button', text: '↑', title: 'Move up', 'aria-label': 'Move up' });
      up.disabled = i === 0;
      up.onclick = () => moveGallery(i, -1);
      const down = el('button', { type: 'button', text: '↓', title: 'Move down', 'aria-label': 'Move down' });
      down.disabled = i === gallery.length - 1;
      down.onclick = () => moveGallery(i, 1);
      const edit = el('button', { type: 'button', text: 'Edit' });
      edit.onclick = () => startGalleryEdit(p);
      const publish = el('button', { type: 'button', text: draft ? 'Publish' : 'Unpublish' });
      publish.onclick = () => setGalleryStatus(p, draft ? 'published' : 'draft');
      const del = el('button', { type: 'button', class: 'danger', text: 'Delete' });
      del.onclick = () => removeGallery(p);
      return el('div', { class: 'adm-row' },
          thumb,
          el('span', { class: 'badge' + (draft ? ' draft' : ''), text: draft ? 'Draft' : '#' + (i + 1) }),
          el('div', { class: 'info' }, el('strong', { text: p.caption || p.image }), p.caption ? el('span', { text: p.image }) : null),
          el('div', { class: 'acts' }, up, down, edit, publish, del));
    }));
  }

  // Swap with the neighbour, then renumber everything 1, 2, 3... so the order is always clean.
  async function moveGallery(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= gallery.length) return;
    const list = gallery.slice();
    [list[i], list[j]] = [list[j], list[i]];
    try {
      const batch = writeBatch(db);
      list.forEach((p, k) => {
        if (p.order !== k + 1) batch.set(doc(db, 'gallery', p.id), { order: k + 1, updatedAt: serverTimestamp(), updatedBy: me.email }, { merge: true });
      });
      await batch.commit();
      await loadGallery();
    } catch (e) {
      say('gallery-form-msg', 'Could not change the order: ' + (e.code || e.message));
    }
  }

  async function setGalleryStatus(p, status) {
    try {
      await setDoc(doc(db, 'gallery', p.id), { status, updatedAt: serverTimestamp(), updatedBy: me.email }, { merge: true });
      await loadGallery();
    } catch (e) {
      say('gallery-form-msg', 'Could not change visibility: ' + (e.code || e.message));
    }
  }

  async function removeGallery(p) {
    if (!confirm('Remove "' + (p.caption || p.image) + '" from the gallery? The image file stays in the repo.')) return;
    try {
      await deleteDoc(doc(db, 'gallery', p.id));
      if (editingGalleryId === p.id) resetGalleryForm();
      await loadGallery();
    } catch (e) {
      say('gallery-form-msg', 'Could not delete: ' + (e.code || e.message));
    }
  }

  function renderGalleryPreview() {
    $('g-preview').replaceChildren(...lines($('g-photos').value).map((raw) => {
      const path = cleanGalleryPath(raw);
      const src = gallerySrc(path);
      if (!src) return el('span', { class: 'adm-thumb bad', text: 'Not allowed: ' + raw });
      const img = el('img', { src, alt: path, title: path, loading: 'lazy' });
      const box = el('span', { class: 'adm-thumb' }, img);
      img.onerror = () => { box.className = 'adm-thumb bad'; box.replaceChildren('Not found: ' + path); };
      return box;
    }));
  }
  $('g-photos').addEventListener('input', renderGalleryPreview);

  function resetGalleryForm() {
    editingGalleryId = null;
    $('gallery-form').reset();
    $('g-preview').replaceChildren();
    $('gallery-form-title').textContent = 'Add photos';
    $('gallery-save-btn').textContent = 'Save';
    $('gallery-cancel-edit').hidden = true;
  }

  function startGalleryEdit(p) {
    editingGalleryId = p.id;
    $('g-photos').value = p.image || '';
    $('g-caption').value = p.caption || '';
    $('g-order').value = p.order ?? '';
    $('g-status').value = p.status || 'published';
    renderGalleryPreview();
    $('gallery-form-title').textContent = 'Edit photo';
    $('gallery-save-btn').textContent = 'Save changes';
    $('gallery-cancel-edit').hidden = false;
    say('gallery-form-msg', '');
    $('gallery-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('gallery-cancel-edit').onclick = resetGalleryForm;

  $('gallery-form').onsubmit = async (e) => {
    e.preventDefault();
    say('gallery-form-msg', '');

    const paths = [...new Set(lines($('g-photos').value).map(cleanGalleryPath))];
    const caption = $('g-caption').value.trim();
    const orderRaw = $('g-order').value.trim();
    const status = $('g-status').value;

    if (!paths.length) { say('gallery-form-msg', 'Please enter at least one photo path.'); return; }
    const bad = paths.find((p) => !gallerySrc(p));
    if (bad) { say('gallery-form-msg', 'This photo path is not allowed: ' + bad); return; }
    if (orderRaw && !(Number.isInteger(Number(orderRaw)) && Number(orderRaw) >= 1)) { say('gallery-form-msg', 'Order must be a whole number, 1 or more.'); return; }
    if (editingGalleryId && paths.length > 1) { say('gallery-form-msg', 'Edit one photo at a time. Cancel editing to add several.'); return; }

    const taken = new Set(gallery.filter((p) => p.id !== editingGalleryId).map((p) => p.image));
    const fresh = paths.filter((p) => !taken.has(p));
    if (!fresh.length) { say('gallery-form-msg', paths.length > 1 ? 'Those photos are already in the gallery.' : 'This photo is already in the gallery.'); return; }
    const skipped = paths.length - fresh.length;

    const last = Math.max(0, ...gallery.map((p) => (Number.isFinite(p.order) ? p.order : 0)));
    $('gallery-save-btn').disabled = true;
    try {
      if (editingGalleryId) {
        const old = gallery.find((p) => p.id === editingGalleryId) || {};
        await setDoc(doc(db, 'gallery', editingGalleryId), {
          image: fresh[0], caption, status,
          order: orderRaw ? Number(orderRaw) : (Number.isFinite(old.order) ? old.order : last + 1),
          updatedAt: serverTimestamp(), updatedBy: me.email,
        }, { merge: true });
      } else {
        const batch = writeBatch(db);
        fresh.forEach((image, k) => {
          batch.set(doc(collection(db, 'gallery')), {
            image, caption, status,
            order: orderRaw && fresh.length === 1 ? Number(orderRaw) : last + 1 + k,
            createdAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: me.email,
          });
        });
        await batch.commit();
      }
      const what = fresh.length > 1 ? fresh.length + ' photos' : 'The photo';
      say('gallery-form-msg',
        (status === 'published' ? what + ' saved. ' + (fresh.length > 1 ? 'They are' : 'It is') + ' live on the site.' : what + ' saved as ' + (fresh.length > 1 ? 'drafts' : 'a draft') + '. Not visible on the site yet.')
        + (skipped ? ' ' + skipped + ' already in the gallery, skipped.' : ''), true);
      resetGalleryForm();
      await loadGallery();
    } catch (ex) {
      say('gallery-form-msg', 'Could not save: ' + (ex.code || ex.message));
    } finally {
      $('gallery-save-btn').disabled = false;
    }
  };

  // ---------- one-time import of the current gallery photos ----------
  $('gallery-import-btn').onclick = async () => {
    if (gallery.length) return;
    $('gallery-import-btn').disabled = true;
    say('gallery-import-msg', 'Importing...', true);
    try {
      const res = await fetch('./seed-gallery.json');
      if (!res.ok) throw new Error('seed-gallery.json not found');
      const list = await res.json();
      const batch = writeBatch(db);
      for (const p of list) {
        batch.set(doc(collection(db, 'gallery')), {
          ...p, status: 'published', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: me.email,
        });
      }
      await batch.commit();
      say('gallery-import-msg', 'Imported ' + list.length + ' photos.', true);
      await loadGallery();
    } catch (e) {
      say('gallery-import-msg', 'Import failed: ' + (e.code || e.message));
      $('gallery-import-btn').disabled = false;
    }
  };

  // ---------- showcase (sections + projects) ----------
  async function loadShowcase() {
    try {
      const [s, p] = await Promise.all([getDocs(collection(db, 'showcaseSections')), getDocs(collection(db, 'showcase'))]);
      showSections = sortByOrder(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.title));
      showProjects = sortByOrder(p.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.title && x.section));
      renderShowcase();
    } catch (e) {
      say('ssec-msg', 'Could not load the showcase (' + (e.code || e.message) + '). If this says "permission-denied", add the showcase rules to firestore.rules and publish it.');
    }
  }

  const sectionTitle = (id) => (showSections.find((s) => s.id === id) || {}).title || id;
  const inSection = (id) => showProjects.filter((p) => p.section === id);

  function renderShowcase() {
    const empty = !showSections.length && !showProjects.length;
    $('showcase-import-card').hidden = !empty;

    // sections
    $('ssec-list').replaceChildren(...showSections.map((s) => {
      const draft = s.status !== 'published';
      const edit = el('button', { type: 'button', text: 'Edit' });
      edit.onclick = () => startSectionEdit(s);
      const pub = el('button', { type: 'button', text: draft ? 'Publish' : 'Unpublish' });
      pub.onclick = () => setStatus('showcaseSections', s.id, draft ? 'published' : 'draft', 'ssec-msg', loadShowcase);
      const del = el('button', { type: 'button', class: 'danger', text: 'Delete' });
      del.onclick = () => removeSection(s);
      return el('div', { class: 'adm-row' },
        el('span', { class: 'badge' + (draft ? ' draft' : ''), text: draft ? 'Draft' : 'Live' }),
        el('div', { class: 'info' }, el('strong', { text: s.title }), el('span', { text: inSection(s.id).length + ' projects' })),
        el('div', { class: 'acts' }, edit, pub, del));
    }));

    // section pickers (project form + list filter)
    const keepForm = $('sp-section').value, keepFilter = $('sp-filter').value || 'all';
    $('sp-section').replaceChildren(...showSections.map((s) => el('option', { value: s.id, text: s.title })));
    if (showSections.some((s) => s.id === keepForm)) $('sp-section').value = keepForm;
    $('sp-filter').replaceChildren(el('option', { value: 'all', text: 'All sections' }), ...showSections.map((s) => el('option', { value: s.id, text: s.title })));
    $('sp-filter').value = showSections.some((s) => s.id === keepFilter) ? keepFilter : 'all';

    // projects
    const f = $('sp-filter').value;
    const list = showSections.flatMap((s) => (f === 'all' || f === s.id ? inSection(s.id) : []));
    $('sp-empty').hidden = list.length > 0;
    const live = list.filter((p) => p.status === 'published').length;
    $('sp-count').textContent = list.length ? live + ' of ' + list.length + ' projects are published.' : '';
    $('sp-list').replaceChildren(...list.map((p) => {
      const draft = p.status !== 'published';
      const sib = inSection(p.section);
      const idx = sib.findIndex((x) => x.id === p.id);
      const src = shotSrc(p.image);
      let thumb;
      if (src) {
        thumb = el('img', { class: 'gthumb', src, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
        thumb.onerror = () => thumb.replaceWith(el('span', { class: 'gthumb bad', text: 'No image' }));
      } else {
        thumb = el('span', { class: 'gthumb bad', text: 'No image' });
      }
      const up = el('button', { type: 'button', text: '↑', title: 'Move up', 'aria-label': 'Move up' });
      up.disabled = idx === 0;
      up.onclick = () => moveProject(p, -1);
      const down = el('button', { type: 'button', text: '↓', title: 'Move down', 'aria-label': 'Move down' });
      down.disabled = idx === sib.length - 1;
      down.onclick = () => moveProject(p, 1);
      const edit = el('button', { type: 'button', text: 'Edit' });
      edit.onclick = () => startProjectEdit(p);
      const pub = el('button', { type: 'button', text: draft ? 'Publish' : 'Unpublish' });
      pub.onclick = () => setStatus('showcase', p.id, draft ? 'published' : 'draft', 'sp-msg', loadShowcase);
      const del = el('button', { type: 'button', class: 'danger', text: 'Delete' });
      del.onclick = () => removeProject(p);
      return el('div', { class: 'adm-row' }, thumb,
        el('span', { class: 'badge' + (draft ? ' draft' : ''), text: draft ? 'Draft' : '#' + (idx + 1) }),
        el('div', { class: 'info' }, el('strong', { text: p.title }), el('span', { text: sectionTitle(p.section) + (p.award ? ' · ' + p.award : '') })),
        el('div', { class: 'acts' }, up, down, edit, pub, del));
    }));
  }
  $('sp-filter').onchange = renderShowcase;

  async function setStatus(coll, id, status, msgId, reload) {
    try {
      await setDoc(doc(db, coll, id), { status, updatedAt: serverTimestamp(), updatedBy: me.email }, { merge: true });
      await reload();
    } catch (e) {
      say(msgId, 'Could not change visibility: ' + (e.code || e.message));
    }
  }

  // ----- sections -----
  function resetSectionForm() {
    editingSectionId = null;
    $('ssec-form').reset();
    $('ssec-title').textContent = 'Add a section';
    $('ssec-save-btn').textContent = 'Save section';
    $('ssec-cancel').hidden = true;
  }

  function startSectionEdit(s) {
    editingSectionId = s.id;
    $('ss-title').value = s.title || '';
    $('ss-blurb').value = s.blurb || '';
    $('ss-link').value = s.link || '';
    $('ss-linklabel').value = s.linkLabel || '';
    $('ss-order').value = s.order ?? '';
    $('ss-status').value = s.status || 'published';
    $('ssec-title').textContent = 'Edit section';
    $('ssec-save-btn').textContent = 'Save changes';
    $('ssec-cancel').hidden = false;
    say('ssec-msg', '');
    $('ssec-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('ssec-cancel').onclick = resetSectionForm;

  $('ssec-form').onsubmit = async (e) => {
    e.preventDefault();
    say('ssec-msg', '');
    const title = $('ss-title').value.trim();
    const link = $('ss-link').value.trim();
    const orderRaw = $('ss-order').value.trim();
    if (!title) { say('ssec-msg', 'Please enter a section title.'); return; }
    if (link && !webLink(link)) { say('ssec-msg', 'The link must start with https://'); return; }
    if (orderRaw && !(Number.isInteger(Number(orderRaw)) && Number(orderRaw) >= 1)) { say('ssec-msg', 'Order must be a whole number, 1 or more.'); return; }

    let id = editingSectionId;
    if (!id) {
      const base = slugify(title) || 'section';
      id = base;
      for (let n = 2; showSections.some((s) => s.id === id); n++) id = base + '-' + n;
    }
    const old = showSections.find((s) => s.id === editingSectionId) || {};
    const last = Math.max(0, ...showSections.map((s) => (Number.isFinite(s.order) ? s.order : 0)));
    const data = {
      title, blurb: $('ss-blurb').value.trim(), link: link ? webLink(link) : '', linkLabel: $('ss-linklabel').value.trim(),
      status: $('ss-status').value,
      order: orderRaw ? Number(orderRaw) : (Number.isFinite(old.order) ? old.order : last + 1),
      updatedAt: serverTimestamp(), updatedBy: me.email,
    };
    if (!editingSectionId) data.createdAt = serverTimestamp();
    $('ssec-save-btn').disabled = true;
    try {
      await setDoc(doc(db, 'showcaseSections', id), data, { merge: true });
      say('ssec-msg', 'Section saved.', true);
      resetSectionForm();
      await loadShowcase();
    } catch (ex) {
      say('ssec-msg', 'Could not save: ' + (ex.code || ex.message));
    } finally {
      $('ssec-save-btn').disabled = false;
    }
  };

  async function removeSection(s) {
    if (inSection(s.id).length) { say('ssec-msg', 'This section still has projects. Delete or move them first, or just unpublish the section.'); return; }
    if (!confirm('Delete the section "' + s.title + '"?')) return;
    try {
      await deleteDoc(doc(db, 'showcaseSections', s.id));
      if (editingSectionId === s.id) resetSectionForm();
      await loadShowcase();
    } catch (e) {
      say('ssec-msg', 'Could not delete: ' + (e.code || e.message));
    }
  }

  // ----- projects -----
  function renderProjectPreview() {
    const raw = $('sp-image').value.trim();
    if (!raw) { $('sp-preview').replaceChildren(); return; }
    const src = shotSrc(cleanShotPath(raw));
    if (!src) { $('sp-preview').replaceChildren(el('span', { class: 'adm-thumb bad', text: 'Not allowed: ' + raw })); return; }
    const img = el('img', { src, alt: '', referrerpolicy: 'no-referrer' });
    const box = el('span', { class: 'adm-thumb' }, img);
    img.onerror = () => { box.className = 'adm-thumb bad'; box.replaceChildren('Not found: ' + raw); };
    $('sp-preview').replaceChildren(box);
  }
  $('sp-image').addEventListener('input', renderProjectPreview);

  function resetProjectForm() {
    editingProjectId = null;
    const keep = $('sp-section').value;
    $('showcase-form').reset();
    if (showSections.some((s) => s.id === keep)) $('sp-section').value = keep;
    $('sp-preview').replaceChildren();
    $('sp-form-title').textContent = 'Add a project';
    $('sp-save-btn').textContent = 'Save project';
    $('sp-cancel').hidden = true;
  }

  function startProjectEdit(p) {
    editingProjectId = p.id;
    $('sp-section').value = p.section;
    $('sp-title').value = p.title || '';
    $('sp-team').value = p.team || '';
    $('sp-desc').value = p.description || '';
    $('sp-tags').value = tagsOf(p.tags).join(', ');
    $('sp-award').value = p.award || '';
    $('sp-demo').value = p.demo || '';
    $('sp-demolabel').value = p.demoLabel || '';
    $('sp-repo').value = p.repo || '';
    $('sp-page').value = p.page || '';
    $('sp-image').value = p.image || '';
    $('sp-order').value = p.order ?? '';
    $('sp-status').value = p.status || 'published';
    renderProjectPreview();
    $('sp-form-title').textContent = 'Edit project';
    $('sp-save-btn').textContent = 'Save changes';
    $('sp-cancel').hidden = false;
    say('sp-msg', '');
    $('showcase-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('sp-cancel').onclick = resetProjectForm;

  $('showcase-form').onsubmit = async (e) => {
    e.preventDefault();
    say('sp-msg', '');
    const section = $('sp-section').value;
    const title = $('sp-title').value.trim();
    const tags = tagsOf($('sp-tags').value);
    const orderRaw = $('sp-order').value.trim();
    const links = { demo: $('sp-demo').value.trim(), repo: $('sp-repo').value.trim(), page: $('sp-page').value.trim() };
    const imageRaw = cleanShotPath($('sp-image').value);

    if (!section) { say('sp-msg', 'Add a section first (above), then choose it here.'); return; }
    if (!title) { say('sp-msg', 'Please enter the project name.'); return; }
    for (const [k, v] of Object.entries(links)) if (v && !webLink(v)) { say('sp-msg', 'The ' + k + ' link must start with https://'); return; }
    if (imageRaw && !shotSrc(imageRaw)) { say('sp-msg', 'This screenshot path is not allowed.'); return; }
    if (tags.length > 10 || tags.some((t) => t.length > 40)) { say('sp-msg', 'Use at most 10 tags, each under 40 characters.'); return; }
    if (orderRaw && !(Number.isInteger(Number(orderRaw)) && Number(orderRaw) >= 1)) { say('sp-msg', 'Order must be a whole number, 1 or more.'); return; }

    const old = showProjects.find((p) => p.id === editingProjectId) || {};
    const last = Math.max(0, ...inSection(section).map((p) => (Number.isFinite(p.order) ? p.order : 0)));
    const data = {
      section, title, team: $('sp-team').value.trim(), description: $('sp-desc').value.trim(), tags,
      award: $('sp-award').value.trim(), demo: links.demo ? webLink(links.demo) : '', demoLabel: $('sp-demolabel').value.trim(),
      repo: links.repo ? webLink(links.repo) : '', page: links.page ? webLink(links.page) : '', image: imageRaw,
      status: $('sp-status').value,
      order: orderRaw ? Number(orderRaw) : (editingProjectId && old.section === section && Number.isFinite(old.order) ? old.order : last + 1),
      updatedAt: serverTimestamp(), updatedBy: me.email,
    };
    $('sp-save-btn').disabled = true;
    try {
      if (editingProjectId) {
        await setDoc(doc(db, 'showcase', editingProjectId), data, { merge: true });
      } else {
        await addDoc(collection(db, 'showcase'), { ...data, createdAt: serverTimestamp() });
      }
      say('sp-msg', data.status === 'published' ? 'Saved. It is live on the Showcase page.' : 'Saved as a draft. Not visible on the site yet.', true);
      resetProjectForm();
      await loadShowcase();
    } catch (ex) {
      say('sp-msg', 'Could not save: ' + (ex.code || ex.message));
    } finally {
      $('sp-save-btn').disabled = false;
    }
  };

  // Swap with the neighbour inside the same section, then renumber that section 1, 2, 3...
  async function moveProject(p, dir) {
    const list = inSection(p.section).slice();
    const i = list.findIndex((x) => x.id === p.id), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    try {
      const batch = writeBatch(db);
      list.forEach((x, k) => {
        if (x.order !== k + 1) batch.set(doc(db, 'showcase', x.id), { order: k + 1, updatedAt: serverTimestamp(), updatedBy: me.email }, { merge: true });
      });
      await batch.commit();
      await loadShowcase();
    } catch (e) {
      say('sp-msg', 'Could not change the order: ' + (e.code || e.message));
    }
  }

  async function removeProject(p) {
    if (!confirm('Delete "' + p.title + '" from the showcase?')) return;
    try {
      await deleteDoc(doc(db, 'showcase', p.id));
      if (editingProjectId === p.id) resetProjectForm();
      await loadShowcase();
    } catch (e) {
      say('sp-msg', 'Could not delete: ' + (e.code || e.message));
    }
  }

  // ----- one-time import -----
  $('showcase-import-btn').onclick = async () => {
    if (showSections.length || showProjects.length) return;
    $('showcase-import-btn').disabled = true;
    say('showcase-import-msg', 'Importing...', true);
    try {
      const res = await fetch('./seed-showcase.json');
      if (!res.ok) throw new Error('seed-showcase.json not found');
      const seed = await res.json();
      const batch = writeBatch(db);
      for (const { id, ...s } of seed.sections) {
        batch.set(doc(db, 'showcaseSections', id), { ...s, status: 'published', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: me.email });
      }
      for (const p of seed.projects) {
        batch.set(doc(collection(db, 'showcase')), { ...p, status: 'published', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: me.email });
      }
      await batch.commit();
      say('showcase-import-msg', 'Imported ' + seed.sections.length + ' section and ' + seed.projects.length + ' projects.', true);
      await loadShowcase();
    } catch (e) {
      say('showcase-import-msg', 'Import failed: ' + (e.code || e.message));
      $('showcase-import-btn').disabled = false;
    }
  };

  // ---------- members (admins only) ----------
  async function loadMembers() {
    const snap = await getDocs(collection(db, 'members'));
    const rows = snap.docs.map((d) => ({ email: d.id, ...d.data() })).sort((a, b) => a.email.localeCompare(b.email));
    $('member-list').replaceChildren(...rows.map((m) => {
      const isMe = m.email === me.email;
      const rm = el('button', { type: 'button', class: 'danger', text: 'Remove' });
      rm.onclick = async () => {
        if (!confirm('Remove ' + m.email + ' from the club members?')) return;
        try { await deleteDoc(doc(db, 'members', m.email)); await loadMembers(); }
        catch (e) { say('member-msg', 'Could not remove: ' + (e.code || e.message)); }
      };
      return el('div', { class: 'adm-row' },
          el('span', { class: 'badge' + (m.role === 'admin' ? ' up' : ''), text: m.role === 'admin' ? 'Admin' : 'Member' }),
          el('div', { class: 'info' }, el('strong', { text: m.email }), isMe ? el('span', { text: 'You' }) : null),
          isMe ? null : el('div', { class: 'acts' }, rm));
    }));
  }

  $('member-form').onsubmit = async (e) => {
    e.preventDefault();
    say('member-msg', '');
    const email = $('m-email').value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { say('member-msg', 'Please enter a valid email address.'); return; }
    try {
      await setDoc(doc(db, 'members', email), { role: $('m-role').value, addedBy: me.email, addedAt: serverTimestamp() });
      say('member-msg', email + ' added.', true);
      $('m-email').value = '';
      await loadMembers();
    } catch (ex) {
      say('member-msg', 'Could not add: ' + (ex.code || ex.message));
    }
  };
}