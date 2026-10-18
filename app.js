/* Shared script for index.html, pastEvents.html and previousTeams.html.
   Load it once in the <head> of each page: <script src="./app.js"></script>
   events.js calls window.ReImagine.refresh(container) after it fills a page with events from the
   database, so the new cards get the scroll animation and the photo carousels. */

// Runs immediately (before the page is drawn), so elements that will animate
// never flash on screen first. If this file fails to load, content just shows normally.
document.documentElement.classList.add('js');

(function () {

  /* ---------- Reveal on scroll ---------- */
  // Add or remove selectors here to change what animates on every page.
  var REVEAL_SELECTOR =
    'section h2.intro, .box, .event-card, .card-container, .feature-item, .past-item, .pe-item';
  var io = null;

  function observer() {
    if (io) return io;
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        el.classList.add('in');
        io.unobserve(el);
        // Hand control back to your normal card styles once the reveal finishes.
        el.addEventListener('transitionend', function done(e) {
          if (e.propertyName !== 'opacity') return;
          el.classList.remove('reveal', 'in');
          el.removeEventListener('transitionend', done);
        });
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    return io;
  }

  function revealIn(root) {
    var targets = Array.prototype.filter.call(root.querySelectorAll(REVEAL_SELECTOR), function (el) {
      return !el._revealed;
    });
    targets.forEach(function (el) { el._revealed = true; el.classList.add('reveal'); });

    // Small stagger so cards in a row appear one after another.
    var groups = Array.prototype.slice.call(root.querySelectorAll('.container, .event-grid'));
    if (root.matches && root.matches('.container, .event-grid')) groups.push(root);
    groups.forEach(function (group) {
      group.querySelectorAll('.reveal').forEach(function (el, i) {
        el.style.setProperty('--d', (i % 3) * 100 + 'ms');
      });
    });

    if (!('IntersectionObserver' in window)) {
      targets.forEach(function (el) { el.classList.add('in'); });
      return;
    }
    targets.forEach(function (el) { observer().observe(el); });
  }

  /* ---------- Photo carousels on the past events page ---------- */
  function galleriesIn(root) {
    var smooth = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    root.querySelectorAll('.pe-image').forEach(function (box) {
      if (box._gallery) return;
      var imgs = box.querySelectorAll('img');
      if (imgs.length < 2) return;
      box._gallery = true;
      var wrap = document.createElement('div');
      wrap.className = 'pe-gallery';
      box.parentNode.insertBefore(wrap, box);
      wrap.appendChild(box);
      box.tabIndex = 0;
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', 'Photo gallery, ' + imgs.length + ' photos');
      function btn(cls, label, txt) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'pe-nav ' + cls;
        b.setAttribute('aria-label', label); b.textContent = txt;
        wrap.appendChild(b); return b;
      }
      var prev = btn('pe-prev', 'Previous photo', '‹');
      var next = btn('pe-next', 'Next photo', '›');
      var count = document.createElement('span');
      count.className = 'pe-count'; count.setAttribute('aria-hidden', 'true');
      wrap.appendChild(count);
      function update() {
        var i = Math.round(box.scrollLeft / (box.clientWidth || 1));
        count.textContent = (i + 1) + ' / ' + imgs.length;
        prev.hidden = i <= 0; next.hidden = i >= imgs.length - 1;
      }
      prev.onclick = function () { box.scrollBy({ left: -box.clientWidth, behavior: smooth }); };
      next.onclick = function () { box.scrollBy({ left: box.clientWidth, behavior: smooth }); };
      box.addEventListener('scroll', update, { passive: true });
      update();
    });
  }

  // Used by events.js after it replaces the built-in cards with events from the database.
  window.ReImagine = {
    refresh: function (root) {
      revealIn(root);
      galleriesIn(root);
    }
  };

  document.addEventListener('DOMContentLoaded', function () {

    /* ---------- Mobile menu ---------- */
    var btn = document.querySelector('.nav-toggle');
    var links = document.getElementById('nav-links');
    if (btn && links) {
      btn.addEventListener('click', function () {
        var open = links.classList.toggle('open');
        btn.setAttribute('aria-expanded', open);
      });
      links.addEventListener('click', function () {
        links.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
      });
    }

    revealIn(document);
    galleriesIn(document);
  });
})();