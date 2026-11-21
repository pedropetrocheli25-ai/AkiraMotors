// assets/js/admin/auditoria.js
// Control interno: registro de actividad (solo se puede agregar, nadie lo edita ni lo borra)
// y tope de descuento del cajero.
(function () {
  'use strict';
  var AKS = window.AKS;
  if (!AKS) { console.error('auditoria.js: falta sistema-core.js'); return; }
  function $(id) { return document.getElementById(id); }

  var SENSIBLES = { venta_anulada: 1, descuento: 1, descuento_autorizado: 1, precio_modificado: 1, costo_modificado: 1,
    stock_modificado_manual: 1, ajuste_conteo: 1, producto_eliminado: 1, devolucion: 1, compra_anulada: 1, gasto_eliminado: 1 };
  var NOMBRES = { ingreso: 'Ingreso al panel', venta_anulada: 'Venta anulada', descuento: 'Descuento', descuento_autorizado: 'Descuento autorizado',
    precio_modificado: 'Precio modificado', costo_modificado: 'Costo modificado', stock_modificado_manual: 'Stock editado a mano',
    ajuste_conteo: 'Ajuste por conteo', producto_eliminado: 'Producto eliminado', producto_creado: 'Producto creado',
    devolucion: 'Devolución', compra_anulada: 'Compra anulada', gasto_eliminado: 'Gasto eliminado', cierre_caja: 'Cierre de caja',
    tasa_bcv_manual: 'Tasa BCV (manual)', tasa_usdt: 'Tasa USDT' };
  var rows = [];

  function html() {
    return '<h2 class="section-title">Control interno</h2>' +
      '<div class="admin-card"><h3>Descuento máximo del cajero</h3>' +
      '<div class="alert-info">Si un cajero da un descuento mayor a este porcentaje, o cambia un precio en la venta, el sistema pide el correo y la contraseña de un dueño. Los dueños no tienen tope.</div>' +
      '<div class="aks-inline"><input type="number" id="aksA-cap" min="0" max="100" step="any" style="max-width:120px"> %' +
      '<button class="btn btn-primary" id="aksA-capsave">Guardar</button></div></div>' +
      '<div class="admin-card"><h3>Registro de actividad</h3>' +
      '<div class="alert-info">Aquí queda anotado quién hizo qué y cuándo. Nadie puede editar ni borrar estos registros desde el sistema, ni siquiera un dueño.</div>' +
      '<div class="aks-inline"><label>Desde <input type="date" id="aksA-d1"></label><label>Hasta <input type="date" id="aksA-d2"></label>' +
      '<select id="aksA-user"><option value="">Todos los usuarios</option></select>' +
      '<select id="aksA-act"><option value="">Todas las acciones</option><option value="__sens">Solo acciones sensibles</option></select>' +
      '<button class="btn btn-primary" id="aksA-go">Ver</button></div>' +
      '<div id="aksA-sum" class="aks-muted" style="margin:.6rem 0"></div>' +
      '<div style="overflow-x:auto"><table class="admin-table"><thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead><tbody id="aksA-body"></tbody></table></div></div>';
  }

  function render() {
    var u = $('aksA-user').value, a = $('aksA-act').value;
    var list = rows.filter(function (r) {
      if (u && r.user !== u) return false;
      if (a === '__sens') return !!SENSIBLES[r.action];
      return !a || r.action === a;
    });
    $('aksA-sum').textContent = list.length + ' registro(s)' + (rows.length >= 500 ? ' (se muestran los 500 más recientes del rango)' : '');
    $('aksA-body').innerHTML = list.map(function (r) {
      return '<tr' + (SENSIBLES[r.action] ? ' style="background:#fff7ed"' : '') + '><td>' + AKS.esc(AKS.fmtDateTime(r.createdAt)) + '</td><td>' +
        AKS.esc(r.user) + '</td><td><strong>' + AKS.esc(NOMBRES[r.action] || r.action) + '</strong></td><td>' + AKS.esc(r.detail) + '</td></tr>';
    }).join('') || '<tr><td colspan="4" class="aks-muted">Sin registros en este rango.</td></tr>';
  }

  async function load() {
    var d1 = $('aksA-d1').value, d2 = $('aksA-d2').value;
    $('aksA-body').innerHTML = '<tr><td colspan="4">Cargando...</td></tr>';
    try {
      var snap = await AKS.db().collection('auditLog').where('dateKey', '>=', d1).where('dateKey', '<=', d2).get();
      rows = []; snap.forEach(function (d) { rows.push(d.data()); });
      rows.sort(function (x, y) { return String(y.createdAt).localeCompare(String(x.createdAt)); });
      rows = rows.slice(0, 500);
      var us = {}, ac = {};
      rows.forEach(function (r) { us[r.user] = 1; ac[r.action] = 1; });
      var cu = $('aksA-user').value, ca = $('aksA-act').value;
      $('aksA-user').innerHTML = '<option value="">Todos los usuarios</option>' + Object.keys(us).map(function (x) { return '<option>' + AKS.esc(x) + '</option>'; }).join('');
      $('aksA-act').innerHTML = '<option value="">Todas las acciones</option><option value="__sens">Solo acciones sensibles</option>' +
        Object.keys(ac).map(function (x) { return '<option value="' + AKS.esc(x) + '">' + AKS.esc(NOMBRES[x] || x) + '</option>'; }).join('');
      $('aksA-user').value = cu; $('aksA-act').value = ca;
      render();
    } catch (e) {
      $('aksA-body').innerHTML = '<tr><td colspan="4" class="aks-bad">No se pudo cargar: ' + AKS.esc(e.message) + '</td></tr>';
    }
  }

  async function loadCap() {
    try {
      var s = await AKS.db().collection('settings').doc('adminSettings').get();
      $('aksA-cap').value = s.exists && s.data().maxDiscountCashier !== undefined ? s.data().maxDiscountCashier : 10;
    } catch (e) { $('aksA-cap').value = 10; }
  }

  async function saveCap() {
    var v = AKS.num($('aksA-cap').value);
    if (v < 0 || v > 100) { alert('Escribe un porcentaje entre 0 y 100'); return; }
    try {
      await AKS.db().collection('settings').doc('adminSettings').set({ maxDiscountCashier: v }, { merge: true });
      AKS.log('tope_descuento', 'Tope de descuento del cajero: ' + v + '%', { value: v });
      alert('Tope guardado: ' + v + '%');
    } catch (e) { alert('No se pudo guardar: ' + e.message); }
  }

  function open() {
    var t = new Date(), f = new Date(t.getTime() - 6 * 86400000);
    if (!$('aksA-d1').value) { $('aksA-d1').value = AKS.dateKey(f); $('aksA-d2').value = AKS.dateKey(t); }
    loadCap(); load();
  }

  AKS.init(function () {
    if (!AKS.addSection('auditoria', html())) return;
    $('aksA-go').addEventListener('click', load);
    $('aksA-user').addEventListener('change', render);
    $('aksA-act').addEventListener('change', render);
    $('aksA-capsave').addEventListener('click', saveCap);
    AKS.addMenuItem('Control interno', 'auditoria', open, 'config');
  });
})();
