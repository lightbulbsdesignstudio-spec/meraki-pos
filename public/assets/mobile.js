(function () {
  // Inject overlay
  const overlay = document.createElement('div');
  overlay.className = 'nav-overlay';
  document.body.appendChild(overlay);

  // Inject hamburger into topbar (before first child)
  const topbar = document.querySelector('.topbar');
  if (topbar) {
    const btn = document.createElement('button');
    btn.className = 'hamburger';
    btn.setAttribute('aria-label', 'Menú');
    btn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`;
    topbar.insertBefore(btn, topbar.firstChild);
    btn.addEventListener('click', openNav);
  }

  overlay.addEventListener('click', closeNav);

  // Close nav when a link is tapped
  document.querySelectorAll('.nav-links a').forEach(a => {
    a.addEventListener('click', closeNav);
  });

  function openNav() { document.body.classList.add('nav-open'); }
  function closeNav() { document.body.classList.remove('nav-open'); }

  // WA detail back button on mobile
  document.addEventListener('wa:openDetalle', function () {
    const detalle = document.querySelector('.wa-panel-detalle');
    if (detalle && window.innerWidth <= 768) detalle.classList.add('activo');
  });
  document.addEventListener('wa:closeDetalle', function () {
    const detalle = document.querySelector('.wa-panel-detalle');
    if (detalle) detalle.classList.remove('activo');
  });
})();
