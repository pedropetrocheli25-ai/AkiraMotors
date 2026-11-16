// assets/js/admin/ventas.js
// Dashboard de ventas (caja + pedidos web) y cambios de precios/costos.
// Requiere sistema-core.js.
(function () {
  'use strict';
  var AKS = window.AKS;
  if (!AKS) { console.error('ventas.js: falta sistema-core.js'); return; }

  var WEB_OK = ['confirmed', 'shipped', 'ready', 'delivered'];
  var LABEL = { efectivo_usd: 'Efectivo $', zelle: 'Zelle $',
    efectivo_bs: 'Efectivo Bs', pago_movil: 'Pago móvil',
    punto: 'Punto de venta', transferencia: 'Transferencia' };
  var root = null;

  function $(id) { return document.getElementById(id); }

  function html() {
    return '<h2 class="section-title">Ventas y reportes</h2>' +
      '<div class="admin-card"><div class="aks-inline">' +
      '<select id="aksV-range"><option value="today">Hoy</option>' +
      '<option value="7">Últimos 7 días</option>' +
      '<option value="month">Este mes</option>' +
      '<option value="custom">Rango personalizado</option></select>' +
      '<input type="date" id="aksV-from" style="display:none">' +
      '<input type="date" id="aksV-to" style="display:none">' +
      '<button class="btn btn-primary" id="aksV-go">Ver</button></div></div>' +
      '<div id="aksV-out" class="aks-muted">Elige un rango.</div>';
  }

  function shift(key, days) {
    var p = key.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2] + days);
    return AKS.dateKey(d);
  }

  function range() {
    var r = $('aksV-range').value, today = AKS.dateKey();
    if (r === 'today') return [today, today];
    if (r === '7') return [shift(today, -6), today];
    if (r === 'month') return [today.slice(0, 8) + '01', today];
    var f = $('aksV-from').value, t = $('aksV-to').value;
    if (!f || !t || f > t) { alert('Elige un rango válido'); return null; }
    return [f, t];
  }

  function bars(rows, fmt) {
    var max = Math.max.apply(null, rows.map(function (r) { return r.v; }).concat([1]));
    return rows.map(function (r) {
      return '<div style="margin:.35rem 0"><div class="aks-row" ' +
        'style="font-size:.85rem"><span>' + AKS.esc(r.k) + '</span><span>' +
        fmt(r.v) + '</span></div><div class="aks-bar"><div style="height:100%;' +
        'border-radius:7px;background:#FF6B1A;width:' +
        Math.max(2, r.v / max * 100).toFixed(1) + '%"></div></div></div>';
    }).join('');
  }

  async function run() {
    var rg = range();
    if (!rg) return;
    var out = $('aksV-out');
    out.innerHTML = 'Cargando...';
    var db = AKS.db();
    try {
      var sales = [];
      var s1 = await db.collection('sales').where('dateKey', '>=', rg[0])
        .where('dateKey', '<=', rg[1]).get();
      s1.forEach(function (d) { var s = d.data(); s._id = d.id; sales.push(s); });
      var ok = sales.filter(function (s) { return s.status === 'completed'; });
      var voided = sales.length - ok.length;

      // pedidos web del rango (fecha ISO en 'date')
      var web = [];
      try {
        var w = await db.collection('orders').get();
        w.forEach(function (d) {
          var o = d.data();
          var dk = String(o.date || '').slice(0, 10);
          if (WEB_OK.indexOf(o.status) !== -1 && dk >= rg[0] && dk <= rg[1]) web.push(o);
        });
      } catch (e) { console.error('orders:', e); }

      var totUsd = 0, totBs = 0, profit = 0, units = 0;
      var prod = {}, pay = {}, day = {};
      ok.forEach(function (s) {
        totUsd += s.totalUsd; totBs += s.totalBs; profit += s.profitUsd || 0;
        day[s.dateKey] = (day[s.dateKey] || 0) + s.totalUsd;
        (s.items || []).forEach(function (it) {
          units += it.qty;
          var k = it.name;
          prod[k] = prod[k] || { q: 0, usd: 0 };
          prod[k].q += it.qty; prod[k].usd += it.lineTotal;
        });
        (s.payments || []).forEach(function (p) {
          pay[p.method] = (pay[p.method] || 0) + p.amountUsd;
        });
      });
      var webUsd = 0;
      web.forEach(function (o) { webUsd += Number(o.total) || 0; });

      var topP = Object.keys(prod).map(function (k) {
        return { k: k + ' (' + prod[k].q + ' u.)', v: prod[k].usd };
      }).sort(function (a, b) { return b.v - a.v; }).slice(0, 10);
      var payR = Object.keys(pay).map(function (k) {
        return { k: LABEL[k] || k, v: pay[k] };
      }).sort(function (a, b) { return b.v - a.v; });
      var dayR = Object.keys(day).sort().map(function (k) {
        return { k: AKS.fmtDate(k), v: day[k] };
      });

      var kp = function (l, v, s) {
        return '<div class="aks-kpi"><div class="aks-muted">' + l + '</div>' +
          '<div style="font-size:1.5rem;font-weight:800">' + v + '</div>' +
          (s ? '<div class="aks-muted">' + s + '</div>' : '') + '</div>';
      };
      var h = '<div class="aks-kpis">' +
        kp('Ventas de caja', AKS.usd(totUsd), AKS.bs(totBs) + ' (a la tasa de cada venta)') +
        kp('N° de ventas', ok.length, units + ' unidades' + (voided ? ' · ' + voided + ' anuladas' : '')) +
        kp('Ganancia estimada', AKS.usd(profit),
          totUsd ? 'Según el costo cargado en compras' : '') +
        kp('Pedidos web confirmados', AKS.usd(webUsd), web.length + ' pedidos') +
        '</div>';
      h += '<div class="aks-grid"><div class="admin-card"><h3>Más vendidos</h3>' +
        (topP.length ? bars(topP, AKS.usd) : '<div class="aks-muted">Sin datos</div>') +
        '</div><div class="admin-card"><h3>Por método de pago</h3>' +
        (payR.length ? bars(payR, AKS.usd) : '<div class="aks-muted">Sin datos</div>') +
        '</div></div>';
      if (dayR.length > 1) {
        h += '<div class="admin-card"><h3>Ventas por día</h3>' + bars(dayR, AKS.usd) + '</div>';
      }
      h += '<div class="admin-card"><h3>Cambios recientes de costo y precio</h3>' +
        '<div id="aksV-changes" class="aks-muted">Cargando...</div></div>';
      out.innerHTML = h;
      loadChanges();
    } catch (e) {
      console.error(e);
      out.innerHTML = '<span class="aks-bad">No se pudo cargar: ' + AKS.esc(e.message) + '</span>';
    }
  }

  async function loadChanges() {
    var box = $('aksV-changes');
    try {
      var snap = await AKS.db().collection('costHistory')
        .orderBy('createdAt', 'desc').limit(30).get();
      if (snap.empty) { box.innerHTML = 'Aún no hay cambios registrados.'; return; }
      var h = '<div class="aks-wrap"><table class="aks-table"><thead><tr><th>Fecha</th>' +
        '<th>Producto</th><th>Costo</th><th>Precio venta</th><th>Origen</th></tr></thead><tbody>';
      snap.forEach(function (d) {
        var r = d.data();
        var up = r.costAfter > r.costBefore, down = r.costAfter < r.costBefore;
        h += '<tr><td>' + AKS.esc(AKS.fmtDateTime(r.createdAt)) + '</td><td>' +
          AKS.esc(r.name) + '</td><td class="' + (up ? 'aks-bad' : down ? 'aks-ok' : '') +
          '">' + AKS.usd(r.costBefore) + ' → ' + AKS.usd(r.costAfter) + '</td><td>' +
          AKS.usd(r.priceBefore) + ' → ' + AKS.usd(r.priceAfter) + '</td><td>' +
          (r.type === 'compra' ? 'Factura ' + AKS.esc(r.invoiceNumber || '')
            : r.type === 'alta' ? 'Alta' : 'Edición') + '</td></tr>';
      });
      box.innerHTML = h + '</tbody></table></div>';
    } catch (e) {
      box.innerHTML = '<span class="aks-bad">' + AKS.esc(e.message) + '</span>';
    }
  }

  AKS.init(function () {
    root = AKS.addSection('ventas', html());
    if (!root) return;
    $('aksV-range').addEventListener('change', function () {
      var c = this.value === 'custom';
      $('aksV-from').style.display = c ? '' : 'none';
      $('aksV-to').style.display = c ? '' : 'none';
    });
    $('aksV-go').addEventListener('click', run);
    AKS.addMenuItem('Ventas / Reportes', 'ventas', run, 'ventas');
  });

  AKS.ventas = { run: run };
})();
