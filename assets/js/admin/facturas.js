// assets/js/admin/facturas.js
// Facturas realizadas (ventas de caja): buscar, ver detalle, reimprimir, anular.
// Requiere sistema-core.js y caja.js.
(function () {
  'use strict';
  var AKS = window.AKS;
  if (!AKS) { console.error('facturas.js: falta sistema-core.js'); return; }

  var METHOD = { efectivo_usd: 'Efectivo $', zelle: 'Zelle $', efectivo_bs: 'Efectivo Bs',
    pago_movil: 'Pago móvil', punto: 'Punto de venta', transferencia: 'Transferencia' };
  var rows = [];
  var root = null;

  function $(id) { return document.getElementById(id); }

  function html() {
    return '<h2 class="section-title">Facturas realizadas</h2>' +
      '<div class="admin-card"><div class="aks-inline">' +
      '<label class="aks-muted">Desde <input type="date" id="aksF-from"></label>' +
      '<label class="aks-muted">Hasta <input type="date" id="aksF-to"></label>' +
      '<select id="aksF-status"><option value="">Todas</option>' +
      '<option value="completed">Completadas</option><option value="voided">Anuladas</option></select>' +
      '<input type="text" id="aksF-q" placeholder="N° de factura, cliente, RIF o teléfono" style="min-width:260px">' +
      '<button class="btn btn-primary" id="aksF-go">Buscar</button></div></div>' +
      '<div id="aksF-out" class="aks-muted">Cargando...</div>';
  }

  function monthStart() { return AKS.dateKey().slice(0, 8) + '01'; }

  async function search() {
    var from = $('aksF-from').value, to = $('aksF-to').value;
    if (!from || !to || from > to) { alert('Elige un rango de fechas válido'); return; }
    var out = $('aksF-out');
    out.innerHTML = 'Cargando...';
    try {
      var snap = await AKS.db().collection('sales').where('dateKey', '>=', from)
        .where('dateKey', '<=', to).limit(1000).get();
      rows = [];
      snap.forEach(function (d) { var s = d.data(); s._id = d.id; rows.push(s); });
      rows.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
      render(snap.size >= 1000);
    } catch (e) {
      console.error(e);
      out.innerHTML = '<span class="aks-bad">No se pudo cargar: ' + AKS.esc(e.message) + '</span>';
    }
  }

  function filtered() {
    var st = $('aksF-status').value, q = AKS.norm($('aksF-q').value);
    return rows.filter(function (s) {
      if (st && s.status !== st) return false;
      if (!q) return true;
      return AKS.norm([s.saleNumber, s.customerName, s.customerDoc, s.customerPhone].join(' ')).indexOf(q) !== -1;
    });
  }

  function render(capped) {
    var list = filtered(), tot = 0, totBs = 0, n = 0;
    list.forEach(function (s) { if (s.status === 'completed') { tot += s.totalUsd; totBs += s.totalBs; n++; } });
    var h = '<div class="aks-kpis">' +
      '<div class="aks-kpi"><div class="aks-muted">Facturas completadas</div><div style="font-size:1.5rem;font-weight:800">' + n + '</div></div>' +
      '<div class="aks-kpi"><div class="aks-muted">Total $</div><div style="font-size:1.5rem;font-weight:800">' + AKS.usd(tot) + '</div></div>' +
      '<div class="aks-kpi"><div class="aks-muted">Total Bs (a la tasa de cada venta)</div><div style="font-size:1.5rem;font-weight:800">' + AKS.bs(totBs) + '</div></div></div>';
    if (capped) h += '<div class="alert-info">Se muestran las primeras 1000 facturas del rango. Usa un rango más corto.</div>';
    if (!list.length) { $('aksF-out').innerHTML = h + '<div class="aks-muted">No hay facturas con esos filtros.</div>'; return; }
    h += '<div class="admin-card"><div class="aks-wrap"><table class="aks-table"><thead><tr><th>N°</th><th>Fecha</th>' +
      '<th>Cliente</th><th>Total $</th><th>Total Bs</th><th>Pago</th><th>Vendedor</th><th>Estado</th><th></th></tr></thead><tbody>' +
      list.map(function (s) {
        var i = rows.indexOf(s), ok = s.status === 'completed';
        return '<tr><td><strong>' + AKS.esc(s.saleNumber) + '</strong></td><td>' + AKS.esc(AKS.fmtDateTime(s.createdAt)) +
          '</td><td>' + AKS.esc(s.customerName || 'Consumidor final') +
          (s.customerDoc ? '<br><span class="aks-muted">' + AKS.esc(s.customerDoc) + '</span>' : '') + '</td><td>' +
          AKS.usd(s.totalUsd) + '</td><td>' + AKS.bs(s.totalBs) + '</td><td>' +
          AKS.esc((s.payments || []).map(function (p) { return METHOD[p.method] || p.method; }).join(' + ')) +
          '</td><td>' + AKS.esc(s.seller || '') + '</td><td>' +
          (ok ? '<span class="aks-ok">Completada</span>' : '<span class="aks-bad">Anulada</span>') + '</td><td>' +
          '<button class="btn btn-secondary btn-small" data-act="view" data-i="' + i + '">Ver</button> ' +
          '<button class="btn btn-secondary btn-small" data-act="print" data-i="' + i + '">Imprimir</button> ' +
          (ok ? '<button class="btn btn-danger btn-small" data-act="void" data-i="' + i + '">Anular</button>' : '') +
          '</td></tr><tr id="aksF-d-' + i + '" style="display:none"><td colspan="9">' + detail(s) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
    $('aksF-out').innerHTML = h;
  }

  function detail(s) {
    var h = '<div class="aks-detail"><table class="aks-table"><thead><tr><th>Código</th><th>Producto</th>' +
      '<th>Cant.</th><th>Precio</th><th>Total</th></tr></thead><tbody>' + (s.items || []).map(function (x) {
        return '<tr><td>' + AKS.esc(x.code) + '</td><td>' + AKS.esc(x.name) + '</td><td>' + x.qty + '</td><td>' +
          AKS.usd(x.unitPrice) + '</td><td>' + AKS.usd(x.lineTotal) + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<div class="aks-muted" style="margin-top:.4rem">Tasa BCV: ' + Number(s.rate).toFixed(2) +
      ' · Subtotal ' + AKS.usd(s.subtotal) + (s.discount ? ' · Descuento ' + AKS.usd(s.discount) : '') +
      (s.changeUsd ? ' · Vuelto ' + AKS.usd(s.changeUsd) : '') + ' · Ganancia estimada ' + AKS.usd(s.profitUsd || 0) + '</div>';
    if (s.status !== 'completed') {
      h += '<div class="aks-bad">Anulada por ' + AKS.esc(s.voidedBy || '') + ': ' + AKS.esc(s.voidReason || '') + '</div>';
    }
    return h + '</div>';
  }

  function bind() {
    $('aksF-go').addEventListener('click', search);
    $('aksF-status').addEventListener('change', function () { render(false); });
    $('aksF-q').addEventListener('input', function () { render(false); });
    root.addEventListener('click', function (ev) {
      var act = ev.target.getAttribute && ev.target.getAttribute('data-act');
      if (!act) return;
      var i = parseInt(ev.target.getAttribute('data-i'), 10), s = rows[i];
      if (!s) return;
      if (act === 'view') {
        var r = $('aksF-d-' + i);
        r.style.display = r.style.display === 'none' ? '' : 'none';
      } else if (act === 'print') {
        if (AKS.caja) AKS.caja.printReceipt(s);
      } else if (act === 'void') {
        if (AKS.caja) AKS.caja.voidSale(s, search);
      }
    });
  }

  async function open() {
    if (!$('aksF-from').value) { $('aksF-from').value = monthStart(); $('aksF-to').value = AKS.dateKey(); }
    await search();
  }

  AKS.init(function () {
    root = AKS.addSection('facturas', html());
    if (!root) return;
    bind();
    AKS.addMenuItem('Facturas realizadas', 'facturas', open, 'ventas');
  });
  AKS.facturas = { open: open };
})();
