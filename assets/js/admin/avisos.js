// assets/js/admin/avisos.js
// Avisos para el dueño: tasa desactualizada y respaldo semanal.
(function () {
  'use strict';
  var AKS = window.AKS;
  if (!AKS) { console.error('avisos.js: falta sistema-core.js'); return; }

  async function check() {
    if (AKS.role === 'cajero') return;
    try {
      var today = AKS.dateKey(), dow = new Date().getDay();
      var s = await AKS.db().collection('settings').doc('bcvRate').get();
      var upd = s.exists ? s.data().updatedAt : '';
      if (!upd) AKS.alertBar('tasa', 'Aún no hay tasa BCV registrada. Configúrala en Tasa BCV.');
      else if (dow !== 0 && AKS.dateKey(new Date(upd)) < today) {
        AKS.alertBar('tasa', 'La tasa BCV no se ha actualizado hoy (última: ' + AKS.fmtDateTime(upd) + '). Los precios en Bs pueden estar desactualizados.');
      }
    } catch (e) { /* sin permiso o sin red */ }
    try {
      var v = localStorage.getItem('aks_last_backup') || '';
      var days = v ? (Date.now() - new Date(v).getTime()) / 86400000 : 999;
      if (days > 7) AKS.alertBar('respaldo', v ? 'Hace ' + Math.floor(days) + ' días que no descargas un respaldo. Hazlo en Ajustes → Respaldo de datos.' : 'Todavía no has descargado ningún respaldo en este equipo. Hazlo en Ajustes → Respaldo de datos.');
    } catch (e) { /* ignorar */ }
  }
  AKS.init(function () { setTimeout(check, 6000); });
})();
