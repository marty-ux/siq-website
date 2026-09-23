document.querySelectorAll('.siq-site-nav').forEach(function (nav) {
  const button = nav.querySelector('.siq-nav-toggle');
  const menu = nav.querySelector('.siq-nav-mobile');
  if (!button || !menu) return;
  function close() {
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', 'Open menu');
  }
  button.addEventListener('click', function () {
    const open = menu.hidden;
    menu.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });
  nav.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !menu.hidden) { close(); button.focus(); }
  });
  document.addEventListener('click', function (event) {
    if (!nav.contains(event.target)) close();
  });
  window.matchMedia('(min-width: 1081px)').addEventListener('change', close);
});
