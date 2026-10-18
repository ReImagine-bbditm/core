// Members-only admin page: Google sign-in, add/edit/delete events and alumni, manage the members list.
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
    if (me.admin) await loadMembers();
  });

  // ---------- tabs ----------
  function tab(name) {
    $('tab-events').hidden = name !== 'events';
    $('tab-alumni').hidden = name !== 'alumni';
    $('tab-members').hidden = name !== 'members';
    $('tab-events-btn').classList.toggle('active', name === 'events');
    $('tab-alumni-btn').classList.toggle('active', name === 'alumni');
    $('tab-members-btn').classList.toggle('active', name === 'members');
  }
  $('tab-events-btn').onclick = () => tab('events');
  $('tab-alumni-btn').onclick = () => tab('alumni');
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