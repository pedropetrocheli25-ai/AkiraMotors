// assets/js/admin/alertas.js
// Alertas de inventario: qué conviene pedir, qué se agota pronto y qué no se mueve.
(function () {
  'use strict';
  var AKS = window.AKS;
  if (!AKS) { console.error('alertas.js: falta sistema-core.js'); return; }
  function $(id) { return document.getElementById(id); }
  var reorden = [];

  function html() {
    return '<h2 class="section-title">Alertas de inventario</h2>' +
      '<div class="admin-card"><div class="alert-info">El sistema revisa tus ventas y te dice qué pedir antes de que se agote y qué producto está parado. ' +
      'Las sugerencias mejoran con el tiempo, a medida que haya más ventas.</div>' +
      '<div class="aks-inline"><label>Días que tarda el proveedor <input type="number" id="aksL-lead" value="7" min="0" style="width:80px"></label>' +
      '<label>Días de mercancía a mantener <input type="number" id="aksL-cover" value="30" min="1" style="width:80px"></label>' +
      '<label>Sin ventas desde hace <select id="aksL-slow"><option value="30">30 días</option><option value="60" selected>60 días</option><option value="90">90 días</option></select></label>' +
      '<button class="btn btn-primary" id="aksL-go">Actualizar</button></div></div>' +
      '<div id="aksL-out"></div>';
  }

  function tbl(title, note, head, rows) {
    return '<div class="admin-card"><h3>' + title + ' <span class="aks-muted">(' + rows.length + ')</span></h3>' +
      '<div class="aks-muted" style="margin-bottom:.5rem">' + note + '</div>' +
      (rows.length ? '<div style="overflow-x:auto"><table class="admin-table"><thead><tr>' +
        head.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
        rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') +
        '</tbody></table></div>' : '<div class="aks-ok">Nada por revisar aquí.</div>') + '</div>';
  }

  async function run() {
    var out = $('aksL-out');
    out.innerHTML = '<div class="aks-muted">Analizando ventas...</div>';
    var lead = AKS.num($('aksL-lead').value), cover = Math.max(1, AKS.num($('aksL-cover').value)), slow = parseInt($('aksL-slow').value, 10);
    try {
      await AKS.loadProducts(true);
      var costs = {};
      var cs = await AKS.db().collection('productCosts').get();
      cs.forEach(function (d) { costs[d.id] = Number(d.data().costPrice) || 0; });
      var from = AKS.dateKey(new Date(Date.now() - 90 * 86400000));
      var ss = await AKS.db().collection('sales').where('dateKey', '>=', from).get();
      var sold30 = {}, last = {}, nSales = 0, cut30 = AKS.dateKey(new Date(Date.now() - 30 * 86400000));
      ss.forEach(function (d) {
        var s = d.data();
        if (s.status !== 'completed') return;
        nSales++;
        (s.items || []).forEach(function (it) {
          if (s.dateKey >= cut30) sold30[it.productId] = (sold30[it.productId] || 0) + (Number(it.qty) || 0);
          if (!last[it.productId] || s.dateKey > last[it.productId]) last[it.productId] = s.dateKey;
        });
      });
      var cutSlow = AKS.dateKey(new Date(Date.now() - slow * 86400000));
      reorden = [];
      var agot = [], parados = [], capital = 0;
      AKS.products.forEach(function (p) {
        var stock = Number(p.stock) || 0, min = Number(p.minStock) || 0;
        var vel = (sold30[p.id] || 0) / 30;
        var dias = vel > 0 ? stock / vel : null;
        var bajo = stock <= min || (dias !== null && dias < lead + 3);
        if (stock <= 0 && vel > 0) { agot.push([AKS.esc(p.code), AKS.esc(p.name), AKS.q(vel * 30), last[p.id] || '-']); }
        if (bajo && !(stock <= 0 && vel === 0 && min === 0)) {
          var sug = Math.max(min > stock ? min - stock : 0, Math.ceil(vel * (lead + cover) - stock));
          if (sug < 1) sug = 1;
          reorden.push({ code: p.code, name: p.name, stock: stock, min: min, sold: AKS.q(vel * 30), days: dias, sug: sug, cost: costs[p.id] || 0 });
        }
        if (stock > 0 && (!last[p.id] || last[p.id] < cutSlow)) {
          var cap = AKS.r2(stock * (costs[p.id] || 0)); capital += cap;
          parados.push([AKS.esc(p.code), AKS.esc(p.name), String(stock), last[p.id] || 'sin ventas', AKS.usd(cap)]);
        }
      });
      reorden.sort(function (a, b) { return (a.days === null ? 9999 : a.days) - (b.days === null ? 9999 : b.days); });
      var h = '<div class="admin-card"><strong>' + nSales + '</strong> ventas analizadas (últimos 90 días). ' +
        (nSales ? '' : '<span class="aks-muted">Aún no hay ventas: por ahora las sugerencias usan solo el stock mínimo de cada producto.</span>') + '</div>';
      h += tbl('Conviene pedir', 'Quedan pocas unidades o se agotarán antes de que llegue el pedido. "Sugerido" cubre ' + (lead + cover) + ' días de venta.',
        ['Código', 'Producto', 'Stock', 'Mínimo', 'Vendido (30 d)', 'Alcanza para', 'Sugerido', 'Costo est.'],
        reorden.map(function (r) {
          return [AKS.esc(r.code), AKS.esc(r.name), String(r.stock), String(r.min), String(r.sold),
            r.days === null ? '-' : (r.days < 1 ? 'menos de 1 día' : Math.floor(r.days) + ' días'), '<strong>' + r.sug + '</strong>', AKS.usd(AKS.r2(r.sug * r.cost))];
        }));
      h += tbl('Agotados que se vendían', 'Productos en cero que se vendieron en los últimos 30 días: cada día sin stock es una venta perdida.',
        ['Código', 'Producto', 'Vendido (30 d)', 'Última venta'], agot);
      h += tbl('Mercancía parada', 'Con stock pero sin ventas en ' + slow + ' días. Dinero inmovilizado: <strong>' + AKS.usd(AKS.r2(capital)) + '</strong> (a costo). Considera ofertas o dejar de comprarlos.',
        ['Código', 'Producto', 'Stock', 'Última venta', 'Capital a costo'], parados);
      out.innerHTML = '<div class="aks-inline" style="margin-bottom:.6rem"><button class="btn btn-secondary" id="aksL-csv">Descargar lista de pedido (Excel/CSV)</button></div>' + h;
      $('aksL-csv').addEventListener('click', csv);
    } catch (e) {
      console.error(e);
      out.innerHTML = '<div class="aks-bad">No se pudo analizar: ' + AKS.esc(e.message) + '</div>';
    }
  }

  function csv() {
    var q = function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; };
    var lines = [['Código', 'Producto', 'Stock', 'Mínimo', 'Cantidad sugerida', 'Costo unitario $', 'Costo total $'].map(q).join(';')];
    reorden.forEach(function (r) {
      lines.push([r.code, r.name, r.stock, r.min, r.sug, AKS.r2(r.cost).toFixed(2).replace('.', ','), AKS.r2(r.sug * r.cost).toFixed(2).replace('.', ',')].map(q).join(';'));
    });
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'Lista_de_pedido_' + AKS.dateKey() + '.csv';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }

  AKS.init(function () {
    if (!AKS.addSection('alertas', html())) return;
    $('aksL-go').addEventListener('click', run);
    AKS.addMenuItem('Alertas de inventario', 'alertas', run, 'inventario');
  });
})();
