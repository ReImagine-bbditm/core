// Touch screens have no hover, so the first tap on "Events" or "Team" opens its dropdown and a second tap
// follows the link. Mouse and keyboard need no script (the dropdown opens on hover and focus).
// Escape or a tap elsewhere closes it. On phones the hamburger menu lists the sub-links, so nothing happens there.
(function () {
  function init() {
    var items = document.querySelectorAll('#nav-links .has-sub');
    if (!items.length) return;
    var touchWide = function () { return matchMedia('(hover: none)').matches && innerWidth > 900; };
    function closeAll(except) {
      items.forEach(function (li) { if (li !== except) li.classList.remove('open'); });
    }
    items.forEach(function (li) {
      var link = li.querySelector(':scope > a');
      if (!link) return;
      link.addEventListener('click', function (e) {
        if (!touchWide() || li.classList.contains('open')) return;
        e.preventDefault();
        closeAll(li);
        li.classList.add('open');
      });
    });
    document.addEventListener('click', function (e) { if (!e.target.closest('#nav-links .has-sub')) closeAll(null); });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      closeAll(null);
      var a = document.activeElement;   // focus inside the menu would keep it open, so let go of it
      if (a && a.closest && a.closest('#nav-links .has-sub')) a.blur();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();