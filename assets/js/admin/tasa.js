// assets/js/admin/tasa.js
// Tasa BCV: valor actual, actualización manual e historial.
// Requiere sistema-core.js.
(function () {
  'use strict';
  var AKS = window.AKS;
  if (!AKS) { console.error('tasa.js: falta sistema-core.js'); return; }
  var root = null;
  function $(id) { return document.getElementById(id); }

  function html() {
    return '<h2 class="section-title">Tasa BCV</h2>' +
      '<div class="admin-card"><div class="aks-kpis">' +
      '<div class="aks-kpi"><div class="aks-muted">Tasa actual (Bs por $1)</div>' +
      '<div style="font-size:2rem;font-weight:800" id="aksT-cur">-</div>' +
      '<div class="aks-muted" id="aksT-when"></div></div></div>' +
      '<div class="alert-info">La Caja, la tienda y los reportes usan esta tasa. ' +
      'Cada venta guarda la tasa del momento en que se hizo.</div>' +
      '<div class="aks-inline"><input type="number" id="aksT-new" min="0" step="0.01" ' +
      'placeholder="Nueva tasa. Ej: 36.50" style="max-width:220px">' +
      '<button class="btn btn-secondary" id="aksT-fetch">Consultar tasa oficial</button>' +
      '<button class="btn btn-primary" id="aksT-save">Actualizar tasa</button></div>' +
      '<div id="aksT-src" class="aks-muted" style="margin-top:.4rem"></div></div>' +
      '<div class="admin-card"><h3>Tasa USDT</h3>' +
      '<div class="alert-info">Se usa en la Caja cuando el cliente paga en USDT: el total de la factura en Bs ' +
      'se divide entre esta tasa y el cliente paga menos $; la diferencia cuenta como descuento. ' +
      'Déjala en blanco o en 0 para ocultar el pago en USDT.</div>' +
      '<div class="aks-kpi" style="margin-bottom:.6rem"><div class="aks-muted">Tasa USDT actual (Bs por USDT)</div>' +
      '<div style="font-size:1.6rem;font-weight:800" id="aksT-ucur">-</div><div class="aks-muted" id="aksT-uwhen"></div></div>' +
      '<div class="aks-inline"><input type="number" id="aksT-unew" min="0" step="0.01" placeholder="Ej: 45.00" style="max-width:220px">' +
      '<button class="btn btn-primary" id="aksT-usave">Guardar tasa USDT</button></div></div>' +
      '<div class="admin-card"><h3>Historial de tasas</h3><div id="aksT-hist" class="aks-muted">' +
      'Cargando...</div></div>';
  }

  async function saveUsdt() {
    var v = AKS.num($('aksT-unew').value);
    if (!(v >= 0) || v > 100000) { alert('Tasa inválida'); return; }
    try {
      await AKS.db().collection('settings').doc('usdtRate').set({ value: v, updatedAt: new Date().toISOString() });
      $('aksT-unew').value = '';
      await refresh();
      alert(v > 0 ? 'Tasa USDT guardada' : 'Pago en USDT desactivado');
    } catch (e) { alert('No se pudo guardar: ' + e.message); }
  }

  async function refresh() {
    try {
      var us = await AKS.db().collection('settings').doc('usdtRate').get();
      var uv = us.exists ? Number(us.data().value) || 0 : 0;
      $('aksT-ucur').textContent = uv > 0 ? uv.toFixed(2) : 'Sin configurar';
      $('aksT-uwhen').textContent = us.exists && us.data().updatedAt ? 'Actualizada: ' + AKS.fmtDateTime(us.data().updatedAt) : '';
    } catch (e) { console.error(e); }
    try {
      var snap = await AKS.db().collection('settings').doc('bcvRate').get();
      if (snap.exists) {
        var d = snap.data();
        $('aksT-cur').textContent = Number(d.value).toFixed(2);
        $('aksT-when').textContent = d.updatedAt
          ? 'Actualizada: ' + AKS.fmtDateTime(d.updatedAt) : '';
      } else {
        $('aksT-cur').textContent = 'Sin configurar';
      }
    } catch (e) { console.error(e); }
    try {
      var h = await AKS.db().collection('bcvHistory').orderBy('createdAt', 'desc').limit(30).get();
      if (h.empty) { $('aksT-hist').innerHTML = 'Aún no hay cambios registrados.'; return; }
      var rows = [];
      h.forEach(function (d) { rows.push(d.data()); });
      var out = '<div class="aks-wrap"><table class="aks-table"><thead><tr><th>Fecha</th>' +
        '<th>Tasa</th><th>Cambio</th><th>Usuario</th></tr></thead><tbody>';
      rows.forEach(function (r, i) {
        var prev = rows[i + 1];
        var ch = prev && prev.value > 0 ? (r.value - prev.value) / prev.value * 100 : null;
        out += '<tr><td>' + AKS.esc(AKS.fmtDateTime(r.createdAt)) + '</td><td><strong>' +
          Number(r.value).toFixed(2) + '</strong></td><td>' +
          (ch === null ? '-' : '<span class="' + (ch > 0 ? 'aks-bad' : 'aks-ok') + '">' +
            (ch > 0 ? '+' : '') + ch.toFixed(2) + '%</span>') +
          '</td><td>' + AKS.esc(r.user || '') + '</td></tr>';
      });
      $('aksT-hist').innerHTML = out + '</tbody></table></div>';
    } catch (e) {
      $('aksT-hist').innerHTML = '<span class="aks-bad">' + AKS.esc(e.message) + '</span>';
    }
  }

  async function fetchRate() {
    var src = $('aksT-src');
    src.textContent = 'Consultando...';
    try {
      var r = await fetch('/api/bcv');
      var j = await r.json();
      if (!r.ok || !j.value) throw new Error(j.error || 'sin respuesta');
      $('aksT-new').value = j.value;
      src.textContent = 'Sugerida: ' + j.value.toFixed(2) + ' · ' + j.source +
        (j.date ? ' · ' + j.date.slice(0, 10) : '') + '. Revísala y pulsa "Actualizar tasa" para aplicarla.';
    } catch (e) { src.innerHTML = '<span class="aks-bad">No se pudo consultar (' + AKS.esc(e.message) + '). Escríbela a mano.</span>'; }
  }

  async function save() {
    var v = AKS.num($('aksT-new').value);
    if (!(v > 0) || v > 100000) { alert('Tasa inválida'); return; }
    if (!confirm('¿Cambiar la tasa BCV a ' + v.toFixed(2) + ' Bs por $?')) return;
    var btn = $('aksT-save');
    btn.disabled = true;
    try {
      var now = new Date().toISOString();
      await AKS.db().collection('settings').doc('bcvRate').set({ value: v, updatedAt: now });
      await AKS.db().collection('bcvHistory').add({ value: v, dateKey: AKS.dateKey(),
        createdAt: now, user: AKS.userLabel() });
      try { bcvRate = v; } catch (e) { /* variable del admin */ }
      await AKS.getRate(true);
      $('aksT-new').value = '';
      await refresh();
      alert('Tasa actualizada');
    } catch (e) {
      console.error(e);
      alert('No se pudo guardar: ' + e.message);
    } finally { btn.disabled = false; }
  }

  AKS.init(function () {
    root = AKS.addSection('tasa', html());
    if (!root) return;
    $('aksT-save').addEventListener('click', save);
    $('aksT-fetch').addEventListener('click', fetchRate);
    $('aksT-usave').addEventListener('click', saveUsdt);
    AKS.addMenuItem('Tasa BCV', 'tasa', refresh, 'config');
  });
  AKS.tasa = { refresh: refresh };
})();
