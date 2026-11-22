// assets/js/admin/reportes.js
// Reportes para decidir: 80/20 por ganancia, ventas por hora y día, ganancia real.
(function () {
  'use strict';
  var AKS = window.AKS;
  if (!AKS) { console.error('reportes.js: falta sistema-core.js'); return; }
  function $(id) { return document.getElementById(id); }
  var DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  function html() {
    return '<h2 class="section-title">Reportes para decidir</h2>' +
      '<div class="admin-card"><div class="aks-inline"><label class="aks-muted">Desde <input type="date" id="aksX-d1"></label>' +
      '<label class="aks-muted">Hasta <input type="date" id="aksX-d2"></label>' +
      '<button class="btn btn-primary" id="aksX-go">Ver reportes</button></div></div><div id="aksX-out"></div>';
  }

  function bar(v, max) { return '<div style="background:#e5e7eb;border-radius:4px;height:10px;min-width:60px"><div style="background:#c8102e;height:10px;border-radius:4px;width:' + (max > 0 ? Math.max(2, Math.round(v / max * 100)) : 0) + '%"></div></div>'; }
  function card(t, note, inner) { return '<div class="admin-card"><h3>' + t + '</h3><div class="aks-muted" style="margin-bottom:.5rem">' + note + '</div>' + inner + '</div>'; }

  function analyze(sales, factor) {
    var prod = {}, hour = [], dow = [], tot = { rev: 0, profit: 0, cost: 0, n: 0 };
    for (var i = 0; i < 24; i++) hour.push({ n: 0, rev: 0 });
    for (i = 0; i < 7; i++) dow.push({ n: 0, rev: 0 });
    sales.forEach(function (s) {
      if (s.status !== 'completed') return;
      tot.n++; tot.rev += Number(s.totalUsd) || 0; tot.profit += Number(s.profitUsd) || 0; tot.cost += Number(s.costUsd) || 0;
      var dt = new Date(String(s.dateKey) + 'T12:00:00');
      if (!isNaN(dt)) { dow[dt.getDay()].n++; dow[dt.getDay()].rev += Number(s.totalUsd) || 0; }
      if (!s.fromPaper && s.createdAt) { var h = new Date(s.createdAt).getHours(); if (h >= 0 && h < 24) { hour[h].n++; hour[h].rev += Number(s.totalUsd) || 0; } }
      var sub = Number(s.subtotal) || 0, net = Number(s.totalUsd) || 0, k = sub > 0 ? net / sub : 1;
      (s.items || []).forEach(function (it) {
        var key = it.productId || it.code, p = prod[key] || (prod[key] = { code: it.code, name: it.name, qty: 0, rev: 0, profit: 0 });
        var rev = (Number(it.lineTotal) || 0) * k, cost = (Number(it.unitCost) || 0) * (Number(it.qty) || 0);
        p.qty += Number(it.qty) || 0; p.rev += rev; p.profit += rev - cost;
      });
    });
    tot.real = tot.profit - tot.cost * (factor - 1);
    return { prod: prod, hour: hour, dow: dow, tot: tot };
  }

  async function run() {
    var d1 = $('aksX-d1').value, d2 = $('aksX-d2').value, out = $('aksX-out');
    if (!d1 || !d2) { alert('Elige las fechas'); return; }
    out.innerHTML = '<div class="aks-muted">Calculando...</div>';
    try {
      var bcv = await AKS.getRate(), us = 0;
      try { var u = await AKS.db().collection('settings').doc('usdtRate').get(); us = u.exists ? Number(u.data().value) || 0 : 0; } catch (e) { /* ignorar */ }
      var factor = us > bcv ? us / bcv : 1, sales = [];
      var ss = await AKS.db().collection('sales').where('dateKey', '>=', d1).where('dateKey', '<=', d2).get();
      ss.forEach(function (d) { sales.push(d.data()); });
      var a = analyze(sales, factor);
      if (!a.tot.n) { out.innerHTML = '<div class="admin-card aks-muted">No hay ventas en ese período.</div>'; return; }
      var list = Object.keys(a.prod).map(function (k) { return a.prod[k]; }).sort(function (x, y) { return y.profit - x.profit; });
      var totalP = list.reduce(function (s, x) { return s + Math.max(0, x.profit); }, 0), acc = 0;
      list.forEach(function (x) { var before = totalP > 0 ? acc / totalP * 100 : 0; acc += Math.max(0, x.profit); x.cum = totalP > 0 ? acc / totalP * 100 : 0; x.cls = before < 80 ? 'A' : (before < 95 ? 'B' : 'C'); });
      var nA = list.filter(function (x) { return x.cls === 'A'; }).length;
      var resumen = '<div style="display:flex;gap:1.5rem;flex-wrap:wrap"><div><div class="aks-muted">Ventas</div><strong>' + a.tot.n + '</strong></div><div><div class="aks-muted">Ingresos</div><strong>' + AKS.usd(a.tot.rev) + '</strong></div>' +
        '<div><div class="aks-muted">Ganancia anotada</div><strong>' + AKS.usd(a.tot.profit) + '</strong></div>' +
        '<div><div class="aks-muted">Ganancia real</div><strong class="' + (a.tot.real < a.tot.profit ? 'aks-bad' : '') + '">' + AKS.usd(a.tot.real) + '</strong></div></div>' +
        '<div class="aks-muted" style="margin-top:.5rem">Ganancia real = ganancia anotada menos lo que cuesta de más reponer la mercancía comprada con USDT (factor ' + factor.toFixed(4) + '). ' +
        (factor > 1 ? 'Diferencia: ' + AKS.usd(a.tot.profit - a.tot.real) + '.' : 'Sin diferencia: la tasa USDT no supera al BCV.') + '</div>';
      var maxH = Math.max.apply(null, a.hour.map(function (x) { return x.rev; })), maxD = Math.max.apply(null, a.dow.map(function (x) { return x.rev; }));
      var hrows = a.hour.map(function (x, h) { return x.n ? '<tr><td>' + h + ':00</td><td>' + x.n + '</td><td>' + AKS.usd(x.rev) + '</td><td>' + bar(x.rev, maxH) + '</td></tr>' : ''; }).join('');
      var drows = a.dow.map(function (x, d) { return '<tr><td>' + DAYS[d] + '</td><td>' + x.n + '</td><td>' + AKS.usd(x.rev) + '</td><td>' + bar(x.rev, maxD) + '</td></tr>'; }).join('');
      var th = function (h) { return '<thead><tr>' + h.map(function (x) { return '<th>' + x + '</th>'; }).join('') + '</tr></thead>'; };
      out.innerHTML = card('Resumen', 'Período ' + AKS.esc(AKS.fmtDate(d1)) + ' a ' + AKS.esc(AKS.fmtDate(d2)), resumen) +
        card('Los productos que te dan el dinero (80/20)', nA + ' de ' + list.length + ' productos generan el 80% de la ganancia (clase A). Mantenlos siempre en stock. La clase C casi no aporta: no inviertas de más ahí.',
          '<div style="overflow-x:auto"><table class="admin-table">' + th(['Clase', 'Código', 'Producto', 'Cant.', 'Ventas', 'Ganancia', '% acum.']) + '<tbody>' +
          list.slice(0, 100).map(function (x) { return '<tr><td><strong>' + x.cls + '</strong></td><td>' + AKS.esc(x.code) + '</td><td>' + AKS.esc(x.name) + '</td><td>' + AKS.q(x.qty) + '</td><td>' + AKS.usd(x.rev) + '</td><td>' + AKS.usd(x.profit) + '</td><td>' + x.cum.toFixed(0) + '%</td></tr>'; }).join('') + '</tbody></table></div>' +
          (list.length > 100 ? '<div class="aks-muted">Se muestran los 100 primeros.</div>' : '')) +
        card('Ventas por día de la semana', 'Para decidir cuándo abrir, descansar o poner más personal.', '<table class="admin-table">' + th(['Día', 'Ventas', 'Ingresos', '']) + '<tbody>' + drows + '</tbody></table>') +
        card('Ventas por hora', 'Las ventas anotadas en papel no se cuentan aquí (no tienen la hora real).', '<table class="admin-table">' + th(['Hora', 'Ventas', 'Ingresos', '']) + '<tbody>' + (hrows || '<tr><td colspan="4">Sin datos</td></tr>') + '</tbody></table>');
    } catch (e) { out.innerHTML = '<div class="aks-bad">' + AKS.esc(e.message) + '</div>'; }
  }

  AKS.reportes = { analyze: analyze };
  AKS.init(function () {
    if (!AKS.addSection('reportes', html())) return;
    $('aksX-go').addEventListener('click', run);
    AKS.addMenuItem('Reportes para decidir', 'reportes', function () {
      if (!$('aksX-d1').value) { $('aksX-d1').value = AKS.dateKey(new Date(Date.now() - 29 * 86400000)); $('aksX-d2').value = AKS.dateKey(); }
    }, 'ventas');
  });
})();
