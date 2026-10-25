// Chevron buttons open and close the nav dropdowns (needed on touch screens, where there is no hover).
// Escape or a click outside closes them. The parent link itself still works as a normal link.
(function () {
  function init() {
    var items = document.querySelectorAll('#nav-links .has-sub');
    if (!items.length) return;
    function closeAll(except) {
      items.forEach(function (li) {
        if (li === except) return;
        li.classList.remove('open');
        var b = li.querySelector('.sub-btn');
        if (b) b.setAttribute('aria-expanded', 'false');
      });
    }
    items.forEach(function (li) {
      var btn = li.querySelector('.sub-btn');
      if (!btn) return;
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = !li.classList.contains('open');
        closeAll(li);
        li.classList.toggle('open', open);
        btn.setAttribute('aria-expanded', String(open));
      });
    });
    document.addEventListener('click', function () { closeAll(null); });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      closeAll(null);
      var a = document.activeElement;   // focus inside the menu would keep it open, so let go of it
      if (a && a.closest && a.closest('#nav-links .has-sub')) a.blur();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();