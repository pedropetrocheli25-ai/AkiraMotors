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
      '<label style="display:block;margin-top:.6rem"><input type="checkbox" id="aksT-auto"> ' +
      'Actualizar automáticamente con la tasa oficial (al abrir el panel, sin preguntar)</label>' +
      '<div id="aksT-src" class="aks-muted" style="margin-top:.4rem"></div></div>' +
      '<div class="admin-card"><h3>Historial de tasas</h3><div id="aksT-hist" class="aks-muted">' +
      'Cargando...</div></div>';
  }

  async function refresh() {
    try {
      var snap = await AKS.db().collection('settings').doc('bcvRate').get();
      if (snap.exists) {
        var d = snap.data();
        $('aksT-auto').checked = d.auto !== false;
        $('aksT-cur').textContent = Number(d.value).toFixed(2);
        $('aksT-when').textContent = d.updatedAt
          ? 'Actualizada: ' + AKS.fmtDateTime(d.updatedAt) : '';
      } else {
        $('aksT-cur').textContent = 'Sin configurar';
        $('aksT-auto').checked = true;
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
    var btn = $('aksT-save');
    btn.disabled = true;
    try {
      var now = new Date().toISOString();
      await AKS.db().collection('settings').doc('bcvRate').set({ value: v, updatedAt: now, auto: $('aksT-auto').checked });
      AKS.log('tasa_bcv_manual', 'Tasa BCV a ' + v.toFixed(2), { value: v });
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

  async function saveAuto() {
    try {
      await AKS.db().collection('settings').doc('bcvRate').set({ auto: $('aksT-auto').checked }, { merge: true });
    } catch (e) { alert('No se pudo guardar: ' + e.message); }
  }

  // Actualización automática de la tasa oficial (solo dueño, sin preguntar).
  async function autoUpdate() {
    if (AKS.role === 'cajero') return;
    try {
      var ref = AKS.db().collection('settings').doc('bcvRate');
      var snap = await ref.get();
      var cur = snap.exists ? Number(snap.data().value) || 0 : 0;
      if (snap.exists && snap.data().auto === false) return;
      var r = await fetch('/api/bcv');
      var j = await r.json();
      var v = Math.round(Number(j.value) * 100) / 100;
      if (!r.ok || !(v > 0) || v > 100000) return;
      if (cur > 0 && Math.abs(v - cur) / cur > 0.25) return; // cambio sospechoso: no se aplica solo
      if (cur > 0 && Math.abs(v - cur) < 0.005) return;
      var now = new Date().toISOString();
      await ref.set({ value: v, updatedAt: now, auto: true });
      await AKS.db().collection('bcvHistory').add({ value: v, dateKey: AKS.dateKey(), createdAt: now, user: 'Automático' });
      await AKS.getRate(true);
      if (root && $('aksT-cur')) refresh();
    } catch (e) { console.warn('Tasa automática:', e.message); }
  }

  AKS.init(function () {
    root = AKS.addSection('tasa', html());
    if (!root) return;
    $('aksT-save').addEventListener('click', save);
    $('aksT-fetch').addEventListener('click', fetchRate);
    $('aksT-auto').addEventListener('change', saveAuto);
    setTimeout(autoUpdate, 3000);
    AKS.addMenuItem('Tasa BCV', 'tasa', refresh, 'config');
  });
  AKS.tasa = { refresh: refresh };
})();
