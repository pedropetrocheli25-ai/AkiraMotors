// assets/js/admin/precios.js
// Reposición (costo real hoy vs precio) y cambio de precios por lote.
(function () {
  'use strict';
  var AKS = window.AKS;
  if (!AKS) { console.error('precios.js: falta sistema-core.js'); return; }
  function $(id) { return document.getElementById(id); }
  var rows = [], factor = 1, rates = { bcv: 0, usdt: 0 };

  function html() {
    return '<h2 class="section-title">Precios y reposición</h2>' +
      '<div class="admin-card"><div class="alert-info">Compras en USDT cuestan más que la tasa BCV. Aquí ves cuánto te cuesta <strong>de verdad</strong> reponer cada producto ' +
      '(costo × USDT ÷ BCV), tu ganancia real y qué precio pondrías para mantener la ganancia que quieres. Puedes cambiar precios en lote con vista previa.</div>' +
      '<div id="aksP-rates" class="aks-muted"></div>' +
      '<div class="aks-inline" style="margin-top:.5rem"><input id="aksP-q" placeholder="Buscar producto, código o marca" style="flex:1;min-width:160px">' +
      '<select id="aksP-cat"><option value="">Todas las categorías</option></select>' +
      '<select id="aksP-brand"><option value="">Todas las marcas</option></select>' +
      '<label class="aks-muted"><input type="checkbox" id="aksP-low"> Solo con ganancia real menor a</label>' +
      '<input type="number" id="aksP-lowv" value="15" style="width:70px"> %</div></div>' +
      '<div class="admin-card"><h3>Cambio por lote</h3><div class="aks-inline">' +
      '<label class="aks-muted">Método <select id="aksP-mode"><option value="pct">Subir/bajar precio un %</option><option value="margin">Ganancia real objetivo %</option></select></label>' +
      '<label class="aks-muted">Valor <input type="number" id="aksP-val" step="0.01" style="width:90px"></label>' +
      '<button class="btn btn-secondary" id="aksP-prev">Ver vista previa</button>' +
      '<button class="btn btn-primary" id="aksP-apply" disabled>Aplicar a los productos mostrados</button></div>' +
      '<div class="aks-muted" id="aksP-st" style="margin-top:.4rem"></div></div>' +
      '<div class="admin-card" id="aksP-out"></div>';
  }

  function effCost(c) { return c * factor; }
  function realMargin(price, c) { return price > 0 ? (price - effCost(c)) / price * 100 : 0; }

  async function load() {
    $('aksP-out').innerHTML = '<div class="aks-muted">Cargando...</div>';
    try {
      await AKS.loadProducts(true);
      var bcv = await AKS.getRate(true), us = 0;
      try { var u = await AKS.db().collection('settings').doc('usdtRate').get(); us = u.exists ? Number(u.data().value) || 0 : 0; } catch (e) { /* sin tasa */ }
      rates = { bcv: bcv, usdt: us };
      factor = us > bcv ? us / bcv : 1;
      $('aksP-rates').textContent = 'BCV ' + AKS.num(bcv).toFixed(2) + ' · USDT ' + (us ? us.toFixed(2) : 'sin configurar') +
        ' → tu costo real de reposición es el costo × ' + factor.toFixed(4);
      var costs = {};
      var cs = await AKS.db().collection('productCosts').get();
      cs.forEach(function (d) { costs[d.id] = Number(d.data().costPrice) || 0; });
      rows = AKS.products.map(function (p) { return { p: p, cost: costs[p.id] || 0 }; }).filter(function (r) { return r.cost > 0; });
      var cats = {}, brs = {};
      AKS.products.forEach(function (p) { if (p.category) cats[p.category] = 1; if (p.brand) brs[p.brand] = 1; });
      var keep = [$('aksP-cat').value, $('aksP-brand').value];
      $('aksP-cat').innerHTML = '<option value="">Todas las categorías</option>' + Object.keys(cats).sort().map(function (c) { return '<option>' + AKS.esc(c) + '</option>'; }).join('');
      $('aksP-brand').innerHTML = '<option value="">Todas las marcas</option>' + Object.keys(brs).sort().map(function (c) { return '<option>' + AKS.esc(c) + '</option>'; }).join('');
      $('aksP-cat').value = keep[0]; $('aksP-brand').value = keep[1];
      draw();
    } catch (e) { $('aksP-out').innerHTML = '<div class="aks-bad">' + AKS.esc(e.message) + '</div>'; }
  }

  function filtered() {
    var q = AKS.norm($('aksP-q').value), c = $('aksP-cat').value, b = $('aksP-brand').value;
    var low = $('aksP-low').checked, lv = AKS.num($('aksP-lowv').value);
    return rows.filter(function (r) {
      var p = r.p;
      if (c && p.category !== c) return false;
      if (b && p.brand !== b) return false;
      if (q && AKS.norm(p.code + ' ' + p.name + ' ' + p.brand + ' ' + p.partNumber).indexOf(q) === -1) return false;
      if (low && !(realMargin(p.price * (1 - p.discount / 100), r.cost) < lv)) return false;
      return true;
    });
  }

  // calcula el precio nuevo (de lista) para una fila según el método
  function newPrice(r) {
    var mode = $('aksP-mode').value, v = AKS.num($('aksP-val').value);
    if (!(v || v === 0) || $('aksP-val').value === '') return null;
    var p = r.p, disc = Number(p.discount) || 0;
    if (mode === 'pct') return AKS.r2(p.price * (1 + v / 100));
    if (v >= 100 || v < 0) return null;
    var eff = effCost(r.cost) / (1 - v / 100);
    return AKS.r2(disc > 0 && disc < 100 ? eff / (1 - disc / 100) : eff);
  }

  var preview = null;
  function draw() {
    var list = filtered().slice(0, 300), prev = preview;
    $('aksP-out').innerHTML = '<div class="aks-muted">' + filtered().length + ' productos con costo' + (filtered().length > 300 ? ' (se muestran 300)' : '') + '</div>' +
      '<div style="overflow-x:auto"><table class="admin-table"><thead><tr><th>Código</th><th>Producto</th><th>Costo</th><th>Costo real</th><th>Precio</th><th>Ganancia<br>anotada</th><th>Ganancia<br>real</th><th>Precio sugerido</th>' + (prev ? '<th>Nuevo precio</th>' : '') + '</tr></thead><tbody>' +
      list.map(function (r) {
        var p = r.p, eff = p.price * (1 - p.discount / 100), mNom = eff > 0 ? (eff - r.cost) / eff * 100 : 0, mReal = realMargin(eff, r.cost);
        var sug = AKS.r2(effCost(r.cost) / (1 - Math.max(mNom, 0) / 100));
        var np = prev ? newPrice(r) : null;
        return '<tr><td>' + AKS.esc(p.code) + '</td><td>' + AKS.esc(p.name) + '</td><td>' + AKS.usd(r.cost) + '</td><td>' + AKS.usd(effCost(r.cost)) + '</td><td>' + AKS.usd(eff) + '</td><td>' + mNom.toFixed(1) + '%</td>' +
          '<td class="' + (mReal < 10 ? 'aks-bad' : '') + '">' + mReal.toFixed(1) + '%</td><td>' + (Math.abs(sug - eff) > 0.005 ? AKS.usd(sug) : '-') + '</td>' +
          (prev ? '<td><strong>' + (np === null ? '-' : AKS.usd(np)) + '</strong></td>' : '') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  function doPreview() {
    var list = filtered();
    if (!list.length) { $('aksP-st').textContent = 'No hay productos con ese filtro.'; return; }
    if ($('aksP-val').value === '') { $('aksP-st').textContent = 'Escribe el valor del cambio.'; return; }
    preview = true; draw();
    var n = list.filter(function (r) { var np = newPrice(r); return np !== null && np > 0 && Math.abs(np - r.p.price) > 0.004; }).length;
    $('aksP-st').textContent = 'Se cambiarían ' + n + ' precios. Revisa la columna "Nuevo precio" y aplica si estás de acuerdo.';
    $('aksP-apply').disabled = !n;
  }

  async function apply() {
    var list = filtered().filter(function (r) { var np = newPrice(r); return np !== null && np > 0 && Math.abs(np - r.p.price) > 0.004; });
    if (!list.length) return;
    if (!confirm('Vas a cambiar el precio de ' + list.length + ' productos. ¿Continuar?')) return;
    var db = AKS.db(), now = new Date().toISOString(), user = AKS.userLabel(), done = 0;
    $('aksP-apply').disabled = true;
    try {
      for (var i = 0; i < list.length; i += 150) {
        var b = db.batch();
        list.slice(i, i + 150).forEach(function (r) {
          var np = newPrice(r);
          b.update(db.collection('products').doc(r.p.id), { price: np, updatedAt: now });
          b.set(db.collection('costHistory').doc(), { productId: r.p.id, code: r.p.code, name: r.p.name, type: 'precio_lote', refId: '',
            costBefore: r.cost, costAfter: r.cost, priceBefore: r.p.price, priceAfter: np, qty: 0, dateKey: AKS.dateKey(), user: user, createdAt: now });
          r.newP = np;
        });
        await b.commit(); done = Math.min(list.length, i + 150);
        $('aksP-st').textContent = 'Aplicando... ' + done + ' de ' + list.length;
      }
      AKS.log('precios_lote', 'Cambio de precios por lote: ' + list.length + ' productos (' + $('aksP-mode').value + ' ' + $('aksP-val').value + ')', { count: list.length });
      $('aksP-st').textContent = 'Listo: ' + list.length + ' precios actualizados.';
      preview = null; await load();
    } catch (e) {
      $('aksP-st').textContent = 'Se detuvo en ' + done + ' de ' + list.length + ': ' + e.message + '. Los anteriores sí se guardaron.';
      preview = null; load();
    }
  }

  AKS.init(function () {
    if (!AKS.addSection('precios', html())) return;
    ['aksP-q', 'aksP-cat', 'aksP-brand', 'aksP-low', 'aksP-lowv'].forEach(function (id) {
      $(id).addEventListener(id === 'aksP-q' || id === 'aksP-lowv' ? 'input' : 'change', function () { preview = null; $('aksP-apply').disabled = true; draw(); });
    });
    ['aksP-mode', 'aksP-val'].forEach(function (id) { $(id).addEventListener('input', function () { preview = null; $('aksP-apply').disabled = true; draw(); }); });
    $('aksP-prev').addEventListener('click', doPreview);
    $('aksP-apply').addEventListener('click', apply);
    AKS.addMenuItem('Precios y reposición', 'precios', load, 'inventario');
  });
})();
