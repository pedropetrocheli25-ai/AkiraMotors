// assets/js/admin/ventas.js
// DASHBOARD del sistema: ventas, ganancia, compras, inventario y alertas.
// Reemplaza el contenido de la sección "Dashboard". Requiere sistema-core.js.
(function () {
  'use strict';
  var AKS = window.AKS;
  if (!AKS) { console.error('ventas.js: falta sistema-core.js'); return; }

  var LABEL = { efectivo_usd: 'Efectivo $', zelle: 'Zelle $', efectivo_bs: 'Efectivo Bs',
    pago_movil: 'Pago móvil', punto: 'Punto de venta', transferencia: 'Transferencia' };
  var root = null;
  var running = false;

  function $(id) { return document.getElementById(id); }

  function html() {
    return '<h2 class="section-title">Dashboard</h2>' +
      '<div class="admin-card"><div class="aks-inline">' +
      '<select id="aksV-range"><option value="today">Hoy</option>' +
      '<option value="yesterday">Ayer</option><option value="7">Últimos 7 días</option>' +
      '<option value="month">Este mes</option><option value="custom">Rango personalizado</option></select>' +
      '<input type="date" id="aksV-from" style="display:none">' +
      '<input type="date" id="aksV-to" style="display:none">' +
      '<button class="btn btn-primary" id="aksV-go">Ver</button>' +
      '<span id="aksV-rate" class="aks-muted" style="margin-left:auto"></span></div></div>' +
      '<div id="aksV-out" class="aks-muted">Cargando...</div>';
  }

  function shift(key, days) {
    var p = key.split('-');
    return AKS.dateKey(new Date(+p[0], +p[1] - 1, +p[2] + days));
  }

  function range() {
    var r = $('aksV-range').value, today = AKS.dateKey();
    if (r === 'today') return [today, today, 'Hoy'];
    if (r === 'yesterday') { var y = shift(today, -1); return [y, y, 'Ayer']; }
    if (r === '7') return [shift(today, -6), today, 'Últimos 7 días'];
    if (r === 'month') return [today.slice(0, 8) + '01', today, 'Este mes'];
    var f = $('aksV-from').value, t = $('aksV-to').value;
    if (!f || !t || f > t) { alert('Elige un rango válido'); return null; }
    return [f, t, 'Rango'];
  }

  function bars(rows, fmt) {
    var max = Math.max.apply(null, rows.map(function (r) { return r.v; }).concat([0.0001]));
    return rows.map(function (r) {
      return '<div style="margin:.4rem 0"><div class="aks-row" style="font-size:.85rem"><span>' +
        AKS.esc(r.k) + '</span><span>' + fmt(r.v) + '</span></div><div class="aks-bar">' +
        '<div style="height:100%;border-radius:7px;background:#FF6B1A;width:' +
        Math.max(2, r.v / max * 100).toFixed(1) + '%"></div></div></div>';
    }).join('');
  }

  // Gráfico de columnas en SVG (una sola serie)
  function colChart(labels, values, fmt) {
    var W = 640, H = 210, P = 30, B = 34;
    var max = Math.max.apply(null, values.concat([0.0001]));
    var n = values.length, slot = (W - P * 2) / n, bw = Math.min(46, slot * 0.7);
    var every = Math.ceil(n / 12);
    var out = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;background:#fff" role="img" ' +
      'aria-label="Ventas por periodo"><line x1="' + P + '" x2="' + (W - P) + '" y1="' + (H - B) +
      '" y2="' + (H - B) + '" stroke="#ddd"/>';
    values.forEach(function (v, i) {
      var h = (H - B - 22) * v / max, x = P + slot * i + (slot - bw) / 2, y = H - B - h;
      out += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) +
        '" height="' + Math.max(h, v > 0 ? 2 : 0).toFixed(1) + '" rx="3" fill="#FF6B1A"><title>' +
        AKS.esc(labels[i]) + ': ' + AKS.esc(fmt(v)) + '</title></rect>';
      if (v > 0 && n <= 14) {
        out += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (y - 4).toFixed(1) +
          '" font-size="10" text-anchor="middle" fill="#444">' + AKS.esc(fmt(v)) + '</text>';
      }
      if (i % every === 0) {
        out += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 14) +
          '" font-size="10" text-anchor="middle" fill="#666">' + AKS.esc(labels[i]) + '</text>';
      }
    });
    return out + '</svg>';
  }

  function kpi(label, value, sub) {
    return '<div class="aks-kpi"><div class="aks-muted">' + label + '</div>' +
      '<div style="font-size:1.55rem;font-weight:800;line-height:1.2">' + value + '</div>' +
      (sub ? '<div class="aks-muted">' + sub + '</div>' : '') + '</div>';
  }

  async function run() {
    if (running) return;
    var rg = range();
    if (!rg) return;
    running = true;
    var out = $('aksV-out');
    out.innerHTML = 'Cargando...';
    var db = AKS.db();
    try {
      var rate = 0;
      try { rate = await AKS.getRate(true); } catch (e) { /* sin tasa */ }
      $('aksV-rate').innerHTML = rate ? 'Tasa BCV: <strong>' + rate.toFixed(2) + '</strong>' :
        '<span class="aks-bad">Tasa BCV sin configurar</span>';

      var sales = [];
      var s1 = await db.collection('sales').where('dateKey', '>=', rg[0]).where('dateKey', '<=', rg[1]).get();
      s1.forEach(function (d) { var s = d.data(); s._id = d.id; sales.push(s); });
      var ok = sales.filter(function (s) { return s.status === 'completed'; });
      var voided = sales.length - ok.length;

      var purchTot = 0, purchN = 0;
      var p1 = await db.collection('purchases').where('invoiceDate', '>=', rg[0]).where('invoiceDate', '<=', rg[1]).get();
      p1.forEach(function (d) { var p = d.data(); if (p.status !== 'voided') { purchTot += p.totalUsd; purchN++; } });

      var expTot = 0, expPend = 0;
      try {
        var e1 = await db.collection('expenses').where('dateKey', '>=', rg[0]).where('dateKey', '<=', rg[1]).get();
        e1.forEach(function (d) { var x = d.data(); expTot += x.amountUsd; if (x.status === 'pending') expPend += x.amountUsd; });
      } catch (e) { /* sin permiso */ }
      await AKS.loadProducts(true);
      var costs = {};
      var cs = await db.collection('productCosts').get();
      cs.forEach(function (d) { costs[d.id] = Number(d.data().costPrice) || 0; });
      var invCost = 0, invPrice = 0, low = [];
      AKS.products.forEach(function (p) {
        invCost += p.stock * (costs[p.id] || 0);
        invPrice += p.stock * AKS.effectivePrice(p);
        if (p.stock <= p.minStock) low.push(p);
      });
      low.sort(function (a, b) { return a.stock - b.stock || a.name.localeCompare(b.name, 'es'); });
      var clientsN = 0;
      try { var cl = await db.collection('clients').get(); clientsN = cl.size; } catch (e) { /* sin permiso */ }

      var totUsd = 0, totBs = 0, profit = 0, units = 0, byProd = {}, byPay = {}, byBucket = {};
      var single = rg[0] === rg[1];
      ok.forEach(function (s) {
        totUsd += s.totalUsd; totBs += s.totalBs; profit += s.profitUsd || 0;
        var bucket = single ? ('0' + new Date(s.createdAt).getHours()).slice(-2) : s.dateKey;
        byBucket[bucket] = (byBucket[bucket] || 0) + s.totalUsd;
        (s.items || []).forEach(function (it) {
          units += it.qty;
          var k = it.productId || it.name;
          byProd[k] = byProd[k] || { name: it.name, code: it.code, q: 0, usd: 0, cost: 0 };
          byProd[k].q += it.qty; byProd[k].usd += it.lineTotal; byProd[k].cost += (it.unitCost || 0) * it.qty;
        });
        (s.payments || []).forEach(function (p) { byPay[p.method] = (byPay[p.method] || 0) + p.amountUsd; });
      });

      var labels = [], values = [], i;
      if (single) {
        for (i = 6; i <= 21; i++) { var hh = ('0' + i).slice(-2); labels.push(hh + 'h'); values.push(byBucket[hh] || 0); }
      } else {
        var d = rg[0];
        while (d <= rg[1] && labels.length < 400) { labels.push(AKS.fmtDate(d).slice(0, 5)); values.push(byBucket[d] || 0); d = shift(d, 1); }
      }

      var prodRows = Object.keys(byProd).map(function (k) { return byProd[k]; }).sort(function (a, b) { return b.q - a.q; });
      var payRows = Object.keys(byPay).map(function (k) { return { k: LABEL[k] || k, v: byPay[k] }; })
        .sort(function (a, b) { return b.v - a.v; });
      var latest = ok.slice().sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); }).slice(0, 8);

      var h = '<div class="aks-kpis">' +
        kpi('Ventas — ' + rg[2], AKS.usd(totUsd), AKS.bs(totBs)) +
        kpi('Facturas', ok.length, units + ' unidades' + (voided ? ' · ' + voided + ' anuladas' : '')) +
        kpi('Ticket promedio', AKS.usd(ok.length ? totUsd / ok.length : 0), '') +
        kpi('Ganancia estimada', AKS.usd(profit), totUsd ? (profit / totUsd * 100).toFixed(1) + '% de margen' : '') +
        '</div><div class="aks-kpis">' +
        kpi('Compras a proveedores', AKS.usd(purchTot), purchN + ' facturas') +
        kpi('Inventario al costo', AKS.usd(invCost), 'A precio de venta: ' + AKS.usd(invPrice)) +
        kpi('Gastos del periodo', AKS.usd(expTot), 'Por pagar: ' + AKS.usd(expPend) + ' · Resultado: ' + AKS.usd(profit - expTot)) +
        kpi('Productos con stock bajo', low.length, 'En su mínimo o por debajo') +
        kpi('Clientes registrados', clientsN, '') + '</div>';

      h += '<div class="aks-grid"><div class="admin-card"><h3>Ventas ' + (single ? 'por hora' : 'por día') + ' ($)</h3>' +
        (totUsd ? colChart(labels, values, function (v) { return '$' + v.toFixed(2); }) :
          '<div class="aks-muted">Sin ventas en este periodo.</div>') + '</div>' +
        '<div class="admin-card"><h3>Formas de pago</h3>' +
        (payRows.length ? bars(payRows, AKS.usd) : '<div class="aks-muted">Sin datos</div>') + '</div></div>';

      h += '<div class="admin-card"><h3>Productos vendidos</h3>' + (prodRows.length ?
        '<div class="aks-wrap"><table class="aks-table"><thead><tr><th>Código</th><th>Producto</th><th>Unidades</th>' +
        '<th>Total $</th><th>Ganancia $</th></tr></thead><tbody>' + prodRows.map(function (x) {
          return '<tr><td>' + AKS.esc(x.code) + '</td><td>' + AKS.esc(x.name) + '</td><td><strong>' + x.q +
            '</strong></td><td>' + AKS.usd(x.usd) + '</td><td>' + AKS.usd(x.usd - x.cost) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="aks-muted">No hay ventas en este periodo.</div>') + '</div>';

      h += '<div class="aks-grid"><div class="admin-card"><h3>Últimas facturas</h3>' + (latest.length ?
        '<div class="aks-wrap"><table class="aks-table"><tbody>' + latest.map(function (s) {
          return '<tr><td>' + AKS.esc(s.saleNumber) + '</td><td>' + AKS.esc(AKS.fmtDateTime(s.createdAt)) +
            '</td><td>' + AKS.esc(s.customerName || 'Consumidor final') + '</td><td><strong>' + AKS.usd(s.totalUsd) + '</strong></td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="aks-muted">Sin facturas.</div>') + '</div>' +
        '<div class="admin-card"><h3>Stock bajo</h3>' + (low.length ?
        '<div class="aks-wrap"><table class="aks-table"><tbody>' + low.slice(0, 8).map(function (p) {
          return '<tr><td>' + AKS.esc(p.name) + '<br><span class="aks-muted">' + AKS.esc(p.code) + '</span></td><td>' +
            '<span class="' + (p.stock <= 0 ? 'aks-bad' : '') + '"><strong>' + p.stock + '</strong> u.</span></td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="aks-ok">Todo el inventario tiene stock suficiente.</div>') + '</div></div>';

      h += '<div class="admin-card"><h3>Cambios recientes de costo y precio</h3><div id="aksV-changes" class="aks-muted">Cargando...</div></div>';
      out.innerHTML = h;
      loadChanges();
    } catch (e) {
      console.error(e);
      out.innerHTML = '<span class="aks-bad">No se pudo cargar: ' + AKS.esc(e.message) + '</span>';
    } finally { running = false; }
  }

  async function loadChanges() {
    var box = $('aksV-changes');
    try {
      var snap = await AKS.db().collection('costHistory').orderBy('createdAt', 'desc').limit(15).get();
      if (snap.empty) { box.innerHTML = 'Aún no hay cambios registrados.'; return; }
      var h = '<div class="aks-wrap"><table class="aks-table"><thead><tr><th>Fecha</th><th>Producto</th><th>Costo</th>' +
        '<th>Precio venta</th><th>Origen</th></tr></thead><tbody>';
      snap.forEach(function (d) {
        var r = d.data(), up = r.costAfter > r.costBefore, down = r.costAfter < r.costBefore;
        h += '<tr><td>' + AKS.esc(AKS.fmtDateTime(r.createdAt)) + '</td><td>' + AKS.esc(r.name) + '</td><td class="' +
          (up ? 'aks-bad' : down ? 'aks-ok' : '') + '">' + AKS.usd(r.costBefore) + ' → ' + AKS.usd(r.costAfter) +
          '</td><td>' + AKS.usd(r.priceBefore) + ' → ' + AKS.usd(r.priceAfter) + '</td><td>' +
          (r.type === 'compra' ? 'Factura ' + AKS.esc(r.invoiceNumber || '') : r.type === 'alta' ? 'Alta' : 'Edición') + '</td></tr>';
      });
      box.innerHTML = h + '</tbody></table></div>';
    } catch (e) { box.innerHTML = '<span class="aks-bad">' + AKS.esc(e.message) + '</span>'; }
  }

  AKS.init(function () {
    root = AKS.addSection('dashboard', html());
    if (!root) return;
    $('aksV-range').addEventListener('change', function () {
      var c = this.value === 'custom';
      $('aksV-from').style.display = c ? '' : 'none';
      $('aksV-to').style.display = c ? '' : 'none';
    });
    $('aksV-go').addEventListener('click', run);
    // Reemplaza el cargador del dashboard viejo (pedidos web)
    window.loadDashboard = function () {
      var sec = $('section-dashboard');
      if (sec && sec.classList.contains('active')) return run();
    };
  });

  AKS.ventas = { run: run };
})();
