// assets/js/admin/usdt.js
// Tasa USDT (independiente de la tasa BCV). Se usa en Caja para pagos en USDT.
(function () {
  'use strict';
  var AKS = window.AKS;
  if (!AKS) { console.error('usdt.js: falta sistema-core.js'); return; }
  function $(id) { return document.getElementById(id); }

  function html() {
    return '<h2 class="section-title">Tasa USDT</h2>' +
      '<div class="admin-card"><div class="alert-info">Es una tasa distinta a la BCV. Se usa en la Caja cuando el ' +
      'cliente paga en USDT: el total de la factura en Bs se divide entre esta tasa y el cliente paga menos $; ' +
      'la diferencia cuenta como descuento. Déjala en 0 para ocultar el pago en USDT.</div>' +
      '<div class="aks-kpi" style="margin-bottom:.6rem"><div class="aks-muted">Tasa USDT actual (Bs por USDT)</div>' +
      '<div style="font-size:2rem;font-weight:800" id="aksU-cur">-</div><div class="aks-muted" id="aksU-when"></div></div>' +
      '<div class="aks-inline"><input type="number" id="aksU-new" min="0" step="0.01" placeholder="Ej: 45.00" style="max-width:220px">' +
      '<button class="btn btn-primary" id="aksU-save">Guardar tasa USDT</button></div></div>';
  }

  async function refresh() {
    try {
      var s = await AKS.db().collection('settings').doc('usdtRate').get();
      var v = s.exists ? Number(s.data().value) || 0 : 0;
      $('aksU-cur').textContent = v > 0 ? v.toFixed(2) : 'Sin configurar';
      $('aksU-when').textContent = s.exists && s.data().updatedAt ? 'Actualizada: ' + AKS.fmtDateTime(s.data().updatedAt) : '';
    } catch (e) { console.error(e); }
  }

  async function save() {
    var v = AKS.num($('aksU-new').value);
    if (!(v >= 0) || v > 100000) { alert('Tasa inválida'); return; }
    try {
      AKS.log('tasa_usdt', 'Tasa USDT a ' + v.toFixed(2), { value: v });
      await AKS.db().collection('settings').doc('usdtRate').set({ value: v, updatedAt: new Date().toISOString() });
      $('aksU-new').value = '';
      await refresh();
      alert(v > 0 ? 'Tasa USDT guardada' : 'Pago en USDT desactivado');
    } catch (e) { alert('No se pudo guardar: ' + e.message); }
  }

  AKS.init(function () {
    if (!AKS.addSection('usdt', html())) return;
    $('aksU-save').addEventListener('click', save);
    AKS.addMenuItem('Tasa USDT', 'usdt', refresh, 'config');
  });
})();
