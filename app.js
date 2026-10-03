/* Shared script for index.html, pastEvents.html and previousTeams.html.
   Load it once in the <head> of each page: <script src="./app.js"></script> */

// Runs immediately (before the page is drawn), so elements that will animate
// never flash on screen first. If this file fails to load, content just shows normally.
document.documentElement.classList.add('js');

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

  /* ---------- Reveal on scroll ---------- */
  // Add or remove selectors here to change what animates on every page.
  var targets = document.querySelectorAll(
    'section h2.intro, .box, .event-card, .card-container, .feature-item, .past-item, .pe-item'
  );
  targets.forEach(function (el) { el.classList.add('reveal'); });

  // Small stagger so cards in a row appear one after another.
  document.querySelectorAll('.container, .event-grid').forEach(function (group) {
    group.querySelectorAll('.reveal').forEach(function (el, i) {
      el.style.setProperty('--d', (i % 3) * 100 + 'ms');
    });
  });

  if (!('IntersectionObserver' in window)) {
    targets.forEach(function (el) { el.classList.add('in'); });
    return;
  }

  var io = new IntersectionObserver(function (entries) {
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

  targets.forEach(function (el) { io.observe(el); });
});