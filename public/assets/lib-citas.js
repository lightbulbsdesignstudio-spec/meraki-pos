// lib-citas.js — Helpers compartidos para schema servicios[] de citas/descuentos.
// Sustituye 3 copias inline previamente duplicadas (clientes.html, index.html, reportes.html).
// Mantiene backward compat con el schema legacy `servicioId` singular.

window.LibCitas = (function () {
  function citaServiciosArray(item) {
    if (!item) return [];
    if (Array.isArray(item.servicios) && item.servicios.length) return item.servicios;
    if (item.servicioId) return [{ id: item.servicioId }];
    return [];
  }

  function getServiciosDeCita(cita, serviciosCatalogo) {
    const arr = citaServiciosArray(cita);
    if (!Array.isArray(serviciosCatalogo)) return [];
    return arr.map(s => serviciosCatalogo.find(svc => svc.id === s.id)).filter(Boolean);
  }

  function montoCita(cita, serviciosCatalogo) {
    if (!cita) return 0;
    if (cita.totalCobrado != null) return Number(cita.totalCobrado);
    return getServiciosDeCita(cita, serviciosCatalogo).reduce((sum, s) => sum + Number(s.precio || 0), 0);
  }

  return {
    citaServiciosArray,
    getServiciosDeCita,
    montoCita,
  };
})();
