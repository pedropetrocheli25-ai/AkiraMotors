// assets/js/admin/importar.js
// Importar productos desde un archivo CSV (Excel > Guardar como > CSV).
// Solo crea productos nuevos; si el código ya existe, esa fila se omite.
(function () {
  'use strict';
  var AKS = window.AKS;
  if (!AKS) { console.error('importar.js: falta sistema-core.js'); return; }
  var HEAD = ['codigo', 'nombre', 'categoria', 'marca', 'costo', 'precio', 'stock', 'descuento', 'descripcion'];
  var root = null, good = [];
  function $(id) { return document.getElementById(id); }

  function html() {
    return '<h2 class="section-title">Importar productos</h2>' +
      '<div class="admin-card"><div class="alert-info">1) Descarga la plantilla y llénala en Excel (una fila por producto). ' +
      '2) Guárdala como <strong>CSV</strong>. 3) Súbela aquí, revisa la vista previa y confirma. ' +
      'Solo se crean productos nuevos: si el código ya existe, esa fila se omite. La categoría debe existir en Catálogo.</div>' +
      '<div class="aks-inline"><button class="btn btn-secondary" id="aksI-tpl">Descargar plantilla</button>' +
      '<input type="file" id="aksI-file" accept=".csv,text/csv"></div>' +
      '<div id="aksI-out" class="aks-muted" style="margin-top:.8rem"></div>' +
      '<button class="btn btn-primary" id="aksI-go" style="display:none;margin-top:.6rem">Importar</button></div>';
  }

  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    var first = text.split(/\r?\n/)[0] || '';
    var d = (first.split(';').length > first.split(',').length) ? ';' : ',';
    var rows = [], row = [], cur = '', q = false, i, c;
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
      } else if (c === '"') q = true;
      else if (c === d) { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (c !== '\r') cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return { rows: rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ''; }); }), d: d };
  }
  function numOf(s, d) {
    s = String(s || '').trim().replace(/\s|\$/g, '');
    if (d === ';' || (s.indexOf(',') !== -1 && s.indexOf('.') === -1)) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
    return s === '' ? NaN : Number(s);
  }

  function template() {
    var csv = '﻿' + HEAD.join(';') + '\r\nA-001;Pastilla de freno delantera;Frenos;Toyota;6,50;10,00;5;0;Juego de 4 pastillas\r\n';
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'Plantilla_productos_AkiraMotors.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }

  async function preview(file) {
    good = []; $('aksI-go').style.display = 'none';
    var text = await file.text();
    var P = parseCSV(text), rows = P.rows;
    if (rows.length < 2) { $('aksI-out').innerHTML = '<span class="aks-bad">El archivo está vacío.</span>'; return; }
    var head = rows[0].map(function (h) { return AKS.norm(h).replace(/[^a-z]/g, ''); });
    var idx = {}; HEAD.forEach(function (h) { idx[h] = head.indexOf(h); });
    var miss = ['codigo', 'nombre', 'categoria', 'costo', 'precio'].filter(function (h) { return idx[h] === -1; });
    if (miss.length) { $('aksI-out').innerHTML = '<span class="aks-bad">Faltan columnas: ' + miss.join(', ') + '. Usa la plantilla.</span>'; return; }
    var cats = [];
    try {
      var cs = await AKS.db().collection('settings').doc('catalogo').get();
      if (cs.exists) cats = (cs.data().categorias || []).map(function (c) { return c.nombre; });
    } catch (e) { $('aksI-out').innerHTML = '<span class="aks-bad">No se pudo leer el catálogo: ' + AKS.esc(e.message) + '</span>'; return; }
    await AKS.loadProducts(true);
    var codes = {}; AKS.products.forEach(function (p) { codes[AKS.norm(p.code)] = 1; });
    var errs = [], seen = {};
    for (var r = 1; r < rows.length; r++) {
      var g = function (k) { return idx[k] === -1 ? '' : String(rows[r][idx[k]] || '').trim(); };
      var code = g('codigo'), name = g('nombre'), cat = g('categoria');
      var cost = numOf(g('costo'), P.d), price = numOf(g('precio'), P.d);
      var stock = g('stock') === '' ? 0 : numOf(g('stock'), P.d), disc = g('descuento') === '' ? 0 : numOf(g('descuento'), P.d);
      var why = '';
      if (!code || !name) why = 'falta código o nombre';
      else if (codes[AKS.norm(code)] || seen[AKS.norm(code)]) why = 'el código ya existe';
      else if (cats.indexOf(cat) === -1) why = 'categoría "' + cat + '" no existe en Catálogo';
      else if (!(price > 0)) why = 'precio inválido';
      else if (isNaN(cost) || cost < 0) why = 'costo inválido';
      else if (price < cost) why = 'precio menor que el costo';
      else if (!(stock >= 0) ) why = 'stock inválido';
      else if (!(disc >= 0 && disc <= 100)) why = 'descuento inválido';
      if (why) { errs.push('Fila ' + (r + 1) + ' (' + AKS.esc(code || '?') + '): ' + why); continue; }
      seen[AKS.norm(code)] = 1;
      good.push({ code: code, name: name, cat: cat, brand: g('marca'), cost: cost, price: price, stock: stock,
        disc: disc, desc: g('descripcion') || name });
    }
    var h = '<strong>' + good.length + '</strong> producto(s) listos para importar · <span class="aks-bad">' + errs.length + ' omitido(s)</span>';
    if (errs.length) h += '<div style="margin-top:.4rem">' + errs.slice(0, 50).join('<br>') + (errs.length > 50 ? '<br>...' : '') + '</div>';
    if (good.length) {
      h += '<div class="aks-wrap" style="margin-top:.6rem"><table class="aks-table"><thead><tr><th>Código</th><th>Nombre</th><th>Categoría</th><th>Costo</th><th>Precio</th><th>Stock</th></tr></thead><tbody>' +
        good.slice(0, 20).map(function (x) {
          return '<tr><td>' + AKS.esc(x.code) + '</td><td>' + AKS.esc(x.name) + '</td><td>' + AKS.esc(x.cat) + '</td><td>' + AKS.usd(x.cost) +
            '</td><td>' + AKS.usd(x.price) + '</td><td>' + x.stock + '</td></tr>';
        }).join('') + '</tbody></table></div>' + (good.length > 20 ? '<div class="aks-muted">Vista previa de los primeros 20.</div>' : '');
      $('aksI-go').style.display = '';
    }
    $('aksI-out').innerHTML = h;
  }

  async function run() {
    if (!good.length || !confirm('¿Importar ' + good.length + ' producto(s)?')) return;
    var db = AKS.db(), now = new Date().toISOString(), user = AKS.userLabel(), done = 0;
    $('aksI-go').disabled = true;
    try {
      for (var i = 0; i < good.length; i += 90) {
        var b = db.batch();
        good.slice(i, i + 90).forEach(function (x) {
          var ref = db.collection('products').doc();
          var margin = x.price > 0 ? AKS.r2((x.price - x.cost) / x.price * 100) : 0;
          b.set(ref, { code: x.code, brand: x.brand, name: x.name, description: x.desc, price: x.price, discount: x.disc,
            stock: x.stock, category: x.cat, subcategory: '', recommended: false,
            attributes: { category: x.cat, subcategory: '', brand: x.brand, partNumber: '', position: '', side: '', condition: '' },
            specifications: [], compatibility: [], searchTerms: '', thumbnail: null, image: null, images: null,
            createdAt: now, updatedAt: now });
          b.set(db.collection('productCosts').doc(ref.id), { costPrice: x.cost, margin: margin, updatedAt: now });
          b.set(db.collection('costHistory').doc(), { productId: ref.id, code: x.code, name: x.name, type: 'alta', refId: '',
            supplier: '', invoiceNumber: '', costBefore: 0, costAfter: x.cost, priceBefore: 0, priceAfter: x.price,
            qty: 0, dateKey: now.slice(0, 10), createdAt: now, user: user });
          b.set(db.collection('stockMovements').doc(), { productId: ref.id, code: x.code, name: x.name, type: 'alta',
            qty: x.stock, stockBefore: 0, stockAfter: x.stock, refType: 'import', refId: ref.id, createdAt: now, user: user });
        });
        await b.commit(); done = Math.min(good.length, i + 90);
      }
      alert('Importados: ' + done + ' producto(s). Las fotos se agregan después, editando cada producto.');
    } catch (e) { console.error(e); alert('Se importaron ' + done + ' antes del error: ' + e.message); }
    good = []; $('aksI-go').style.display = 'none'; $('aksI-go').disabled = false; $('aksI-file').value = '';
    $('aksI-out').innerHTML = '';
    AKS.refreshAdminProducts();
  }

  AKS.init(function () {
    root = AKS.addSection('importar', html());
    if (!root) return;
    $('aksI-tpl').addEventListener('click', template);
    $('aksI-go').addEventListener('click', run);
    $('aksI-file').addEventListener('change', function (ev) {
      if (ev.target.files[0]) preview(ev.target.files[0]).catch(function (e) { $('aksI-out').innerHTML = '<span class="aks-bad">' + AKS.esc(e.message) + '</span>'; });
    });
    AKS.addMenuItem('Importar productos', 'importar', function () {}, 'inventario');
  });
})();
