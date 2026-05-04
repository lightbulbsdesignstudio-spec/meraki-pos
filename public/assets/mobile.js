(function () {
  if (window.innerWidth > 768) return;

  const path = location.pathname;
  const current = path.includes('clientes') ? 'clientes'
    : path.includes('servicios') ? 'servicios'
    : path.includes('reportes') ? 'reportes'
    : path.includes('socios') ? 'socios'
    : path.includes('config') ? 'config'
    : 'agenda';

  const ITEMS = [
    {
      id: 'agenda', href: '/index.html', label: 'Agenda',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
    },
    {
      id: 'clientes', href: '/clientes.html', label: 'Clientes',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
    },
    {
      id: 'servicios', href: '/servicios.html', label: 'Servicios',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>'
    },
    {
      id: 'reportes', href: '/reportes.html', label: 'Reportes',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>'
    },
    {
      id: 'config', href: '/config.html', label: 'Config',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93A10 10 0 0 0 4.93 19.07M4.93 4.93A10 10 0 0 0 19.07 19.07"/></svg>'
    },
  ];

  const bar = document.createElement('nav');
  bar.className = 'nav-bottom';
  bar.innerHTML = ITEMS.map(item =>
    `<a href="${item.href}" class="nav-bottom-item${item.id === current ? ' active' : ''}">${item.icon}<span>${item.label}</span></a>`
  ).join('');
  document.body.appendChild(bar);

  // WA detail back button
  function abrirDetalleMovil() {
    const d = document.getElementById('waDetail');
    if (d) d.classList.add('activo');
  }
  function cerrarDetalleMovil() {
    const d = document.getElementById('waDetail');
    if (d) d.classList.remove('activo');
  }
  window.abrirDetalleMovil = abrirDetalleMovil;
  window.cerrarDetalleMovil = cerrarDetalleMovil;
})();
