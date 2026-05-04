// session.js — helper de sesión compartido
// Carga al inicio de cada página protegida. Si no hay sesión -> redirige a /login.html.
// Expone window.currentUser y window.logout().

(function () {
  if (location.pathname.endsWith('/login.html')) return; // login no se auto-protege

  async function loadSession() {
    try {
      const r = await fetch('/api/auth?action=me', { credentials: 'same-origin' });
      if (r.status === 401) {
        location.href = '/login.html?next=' + encodeURIComponent(location.pathname + location.search);
        return null;
      }
      const d = await r.json();
      if (!d.ok) {
        location.href = '/login.html';
        return null;
      }
      return d.data;
    } catch (e) {
      console.error('Error cargando sesión', e);
      return null;
    }
  }

  window.logout = async function () {
    try {
      await fetch('/api/auth?action=logout', { method: 'POST', credentials: 'same-origin' });
    } catch (e) { /* ignore */ }
    location.href = '/login.html';
  };

  // Helper para esconder/mostrar elementos según rol del usuario
  // <elemento data-rol="admin,socio"> => visible solo a admin y socio
  // <elemento data-rol="!empleada"> => visible para todos menos empleada
  window.applyRoleGating = function (user) {
    document.querySelectorAll('[data-rol]').forEach(el => {
      const expr = el.getAttribute('data-rol').trim();
      let visible = true;
      if (expr.startsWith('!')) {
        const denied = expr.slice(1).split(',').map(s => s.trim());
        visible = !denied.includes(user.rol);
      } else {
        const allowed = expr.split(',').map(s => s.trim());
        visible = allowed.includes(user.rol);
      }
      if (!visible) el.style.display = 'none';
    });
  };

  // Auto-cargar sesión y exponer
  loadSession().then(user => {
    if (!user) return;
    window.currentUser = user;

    // Guard a nivel página: <body data-page-rol="admin,socio"> o data-page-rol="!empleada"
    const body = document.body;
    const pageRol = body && body.getAttribute('data-page-rol');
    if (pageRol) {
      let allowed = true;
      if (pageRol.startsWith('!')) {
        allowed = !pageRol.slice(1).split(',').map(s => s.trim()).includes(user.rol);
      } else {
        allowed = pageRol.split(',').map(s => s.trim()).includes(user.rol);
      }
      if (!allowed) {
        location.href = user.rol === 'socio' ? '/socios.html' : '/index.html';
        return;
      }
    }

    window.dispatchEvent(new CustomEvent('session:ready', { detail: user }));
    window.applyRoleGating(user);
    injectUserBadge(user);
  });

  // Badge de usuario en topbar con menú (cambiar contraseña, cerrar sesión)
  function injectUserBadge(user) {
    const topbar = document.querySelector('.topbar');
    if (!topbar || topbar.querySelector('.user-badge')) return;

    const wrap = document.createElement('div');
    wrap.className = 'user-badge';
    wrap.style.cssText = 'position:relative;margin-left:auto;';
    const initials = (user.nombre || user.username || '?').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
    const rolColor = user.rol === 'admin' ? '#C17E5A' : user.rol === 'socio' ? '#92400E' : '#1E40AF';
    wrap.innerHTML = `
      <button id="userBadgeBtn" type="button" style="display:flex;align-items:center;gap:8px;background:transparent;border:1px solid #EAE5DF;border-radius:999px;padding:5px 12px 5px 5px;cursor:pointer;font-family:inherit;color:#18181A">
        <span style="width:28px;height:28px;border-radius:50%;background:${rolColor};color:white;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600">${initials}</span>
        <span style="font-size:13px;font-weight:500">${user.nombre || user.username}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div id="userMenu" style="display:none;position:absolute;right:0;top:calc(100% + 6px);background:white;border:1px solid #EAE5DF;border-radius:10px;box-shadow:0 10px 30px -10px rgba(0,0,0,0.18);min-width:200px;z-index:1000;padding:6px;font-family:inherit">
        <div style="padding:10px 12px 8px;border-bottom:1px solid #F3EEE9;margin-bottom:4px">
          <div style="font-size:13px;font-weight:600;color:#18181A">${user.nombre || user.username}</div>
          <div style="font-size:11px;color:#928D89;text-transform:capitalize">${user.rol}</div>
        </div>
        <button onclick="window.openChangePassword()" style="width:100%;text-align:left;padding:9px 12px;background:none;border:none;font-size:13px;color:#18181A;cursor:pointer;border-radius:6px;font-family:inherit">Cambiar contraseña</button>
        <button onclick="window.logout()" style="width:100%;text-align:left;padding:9px 12px;background:none;border:none;font-size:13px;color:#C44E4E;cursor:pointer;border-radius:6px;font-family:inherit">Cerrar sesión</button>
      </div>
    `;
    // Asegura que actions container exista
    let actions = topbar.querySelector('.topbar-actions');
    if (actions) {
      actions.appendChild(wrap);
    } else {
      topbar.appendChild(wrap);
    }
    const btn = wrap.querySelector('#userBadgeBtn');
    const menu = wrap.querySelector('#userMenu');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    });
    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) menu.style.display = 'none';
    });
    wrap.querySelectorAll('button[onclick^="window."]').forEach(b => {
      b.addEventListener('mouseenter', () => b.style.background = '#F6F2EF');
      b.addEventListener('mouseleave', () => b.style.background = 'none');
    });
  }

  window.openChangePassword = function () {
    const actual = prompt('Contraseña actual:');
    if (!actual) return;
    const nueva = prompt('Nueva contraseña (mínimo 6 caracteres):');
    if (!nueva || nueva.length < 6) { alert('Contraseña inválida'); return; }
    const nueva2 = prompt('Confirma la nueva contraseña:');
    if (nueva !== nueva2) { alert('Las contraseñas no coinciden'); return; }
    fetch('/api/auth?action=change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ actual, nueva }),
    }).then(r => r.json()).then(d => {
      if (d.ok) alert('Contraseña actualizada');
      else alert(d.error || 'Error al cambiar contraseña');
    });
  };
})();
