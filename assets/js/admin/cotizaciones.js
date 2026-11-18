// assets/js/admin/cotizaciones.js
// Cotizaciones (presupuestos): no descuentan stock. Se imprimen, se envían por WhatsApp
// o se abren en la Caja para cobrarlas. Colección 'quotes'.
(function () {
  'use strict';
  var AKS = window.AKS;
  if (!AKS) { console.error('cotizaciones.js: falta sistema-core.js'); return; }
  var lines = [], saved = [], root = null, rate = 0, company = 'AKIRA MOTORS';
  function $(id) { return document.getElementById(id); }

  function html() {
    return '<h2 class="section-title">Cotizaciones</h2>' +
      '<div class="admin-card"><div class="form-row-3">' +
      '<div class="form-group"><label>Cliente</label><input type="text" id="aksK-name" maxlength="100"></div>' +
      '<div class="form-group"><label>RIF / Cédula</label><input type="text" id="aksK-doc" maxlength="20"></div>' +
      '<div class="form-group"><label>Teléfono</label><input type="tel" id="aksK-phone" maxlength="11"></div></div>' +
      '<input type="text" id="aksK-q" class="aks-search" placeholder="Buscar producto por código o nombre...">' +
      '<div id="aksK-res" class="aks-results"></div>' +
      '<div id="aksK-lines" style="margin-top:.8rem"></div>' +
      '<div class="form-row-3"><div class="form-group"><label>Válida por (días)</label>' +
      '<input type="number" id="aksK-days" value="7" min="1" max="90"></div>' +
      '<div class="form-group" style="grid-column:span 2"><label>Notas</label>' +
      '<input type="text" id="aksK-notes" maxlength="200" placeholder="Ej: precios sujetos a disponibilidad"></div></div>' +
      '<div class="aks-inline"><button class="btn btn-primary" id="aksK-save">Guardar e imprimir</button>' +
      '<button class="btn btn-secondary" id="aksK-wa">Enviar por WhatsApp</button>' +
      '<button class="btn btn-secondary" id="aksK-clear">Limpiar</button></div></div>' +
      '<div class="admin-card"><h3>Cotizaciones recientes</h3><div id="aksK-hist" class="aks-muted">Cargando...</div></div>';
  }

  function total() { return AKS.r2(lines.reduce(function (a, l) { return a + l.qty * l.unitPrice; }, 0)); }

  function renderLines() {
    if (!lines.length) { $('aksK-lines').innerHTML = '<span class="aks-muted">Agrega productos a la cotización.</span>'; return; }
    $('aksK-lines').innerHTML = '<div class="aks-wrap"><table class="aks-table"><thead><tr><th>Producto</th><th>Cant.</th>' +
      '<th>Precio $</th><th>Subtotal</th><th></th></tr></thead><tbody>' + lines.map(function (l, i) {
        return '<tr><td>' + AKS.esc(l.code) + ' · ' + AKS.esc(l.name) + '</td>' +
          '<td><input type="number" min="1" step="1" value="' + l.qty + '" data-f="qty" data-i="' + i + '" style="width:70px"></td>' +
          '<td><input type="number" min="0" step="0.01" value="' + l.unitPrice + '" data-f="price" data-i="' + i + '" style="width:90px"></td>' +
          '<td>' + AKS.usd(l.qty * l.unitPrice) + '</td><td><button class="btn btn-danger btn-small" data-rm="' + i + '">Quitar</button></td></tr>';
      }).join('') + '</tbody></table></div><div class="aks-total" style="margin-top:.5rem">Total: <strong>' +
      AKS.usd(total()) + '</strong> · ' + AKS.bs(AKS.r2(total() * rate)) + ' <span class="aks-muted">(tasa ' + Number(rate).toFixed(2) + ')</span></div>';
  }

  function build() {
    if (!lines.length) { alert('Agrega al menos un producto'); return null; }
    for (var i = 0; i < lines.length; i++) {
      if (!(Number.isInteger(lines[i].qty) && lines[i].qty >= 1) || !(lines[i].unitPrice > 0)) {
        alert('Revisa cantidad y precio de "' + lines[i].name + '"'); return null;
      }
    }
    var days = Math.max(1, Math.min(90, Math.floor(AKS.num($('aksK-days').value)) || 7));
    var now = new Date();
    return { number: 'C-' + Date.now().toString(36).toUpperCase().slice(-6), dateKey: AKS.dateKey(),
      clientName: $('aksK-name').value.trim(), clientDoc: $('aksK-doc').value.trim(), clientPhone: $('aksK-phone').value.trim(),
      items: lines.map(function (l) { return { productId: l.productId, code: l.code, name: l.name, qty: l.qty,
        unitPrice: l.unitPrice, lineTotal: AKS.r2(l.qty * l.unitPrice) }; }),
      totalUsd: total(), rate: rate, totalBs: AKS.r2(total() * rate), validDays: days,
      validUntil: new Date(now.getTime() + days * 86400000).toISOString().slice(0, 10),
      notes: $('aksK-notes').value.trim(), user: AKS.userLabel(), createdAt: now.toISOString() };
  }

  function printQuote(q) {
    var w = window.open('', '_blank');
    if (!w) { alert('Permite ventanas emergentes para imprimir'); return; }
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Cotización ' + AKS.esc(q.number) + '</title><style>' +
      'body{font-family:Arial,sans-serif;max-width:720px;margin:20px auto;color:#111}h1{margin:0}table{width:100%;border-collapse:collapse;margin-top:14px}' +
      'th,td{border-bottom:1px solid #ddd;padding:6px;text-align:left;font-size:14px}th{background:#f3f3f3}td.r,th.r{text-align:right}' +
      '.t{margin-top:14px;text-align:right;font-size:16px}.m{color:#666;font-size:12px;margin-top:18px}</style></head><body>' +
      '<h1>' + AKS.esc(company) + '</h1><div>Cotización <strong>' + AKS.esc(q.number) + '</strong> · ' + AKS.esc(AKS.fmtDate(q.dateKey)) + '</div>' +
      '<div>Cliente: ' + AKS.esc(q.clientName || 'Cliente') + (q.clientDoc ? ' · ' + AKS.esc(q.clientDoc) : '') + '</div>' +
      '<table><thead><tr><th>Código</th><th>Producto</th><th class="r">Cant.</th><th class="r">Precio</th><th class="r">Total</th></tr></thead><tbody>' +
      q.items.map(function (x) { return '<tr><td>' + AKS.esc(x.code) + '</td><td>' + AKS.esc(x.name) + '</td><td class="r">' + x.qty +
        '</td><td class="r">' + AKS.usd(x.unitPrice) + '</td><td class="r">' + AKS.usd(x.lineTotal) + '</td></tr>'; }).join('') +
      '</tbody></table><div class="t">Total: <strong>' + AKS.usd(q.totalUsd) + '</strong><br>' + AKS.bs(q.totalBs) +
      ' (tasa BCV ' + Number(q.rate).toFixed(2) + ')</div>' +
      '<div class="m">Válida hasta el ' + AKS.esc(AKS.fmtDate(q.validUntil)) + '. Precios sujetos a disponibilidad. ' + AKS.esc(q.notes || '') +
      '<br>Este documento es una cotización, no una factura.</div><script>window.onload=function(){window.print()}<\/script></body></html>');
    w.document.close();
  }

  function waText(q) {
    return 'Cotización ' + q.number + ' - ' + company + '\n\n' + q.items.map(function (x) {
      return '- ' + x.name + ' x' + x.qty + ' = ' + AKS.usd(x.lineTotal);
    }).join('\n') + '\n\nTotal: ' + AKS.usd(q.totalUsd) + ' / ' + AKS.bs(q.totalBs) + ' (BCV ' + Number(q.rate).toFixed(2) +
      ')\nVálida hasta el ' + AKS.fmtDate(q.validUntil) + '. Sujeta a disponibilidad.';
  }

  async function save() {
    var q = build(); if (!q) return;
    try {
      await AKS.db().collection('quotes').add(q);
      printQuote(q); lines = []; renderLines(); loadHist();
    } catch (e) { alert('No se pudo guardar: ' + e.message); }
  }

  function wa() {
    var q = build(); if (!q) return;
    var ph = q.clientPhone.replace(/\D/g, '');
    if (/^0\d{10}$/.test(ph)) ph = '58' + ph.slice(1);
    window.open('https://wa.me/' + (ph.length >= 11 ? ph : '') + '?text=' + encodeURIComponent(waText(q)), '_blank', 'noopener');
  }

  async function loadHist() {
    var box = $('aksK-hist');
    try {
      var s = await AKS.db().collection('quotes').orderBy('createdAt', 'desc').limit(30).get();
      saved = []; s.forEach(function (d) { var x = d.data(); x._id = d.id; saved.push(x); });
      if (!saved.length) { box.innerHTML = 'Aún no hay cotizaciones.'; return; }
      box.innerHTML = '<div class="aks-wrap"><table class="aks-table"><thead><tr><th>N°</th><th>Fecha</th><th>Cliente</th><th>Total</th><th>Vence</th><th></th></tr></thead><tbody>' +
        saved.map(function (q, i) {
          return '<tr><td><strong>' + AKS.esc(q.number) + '</strong></td><td>' + AKS.esc(AKS.fmtDate(q.dateKey)) + '</td><td>' +
            AKS.esc(q.clientName || '-') + '</td><td>' + AKS.usd(q.totalUsd) + '</td><td>' + AKS.esc(AKS.fmtDate(q.validUntil)) + '</td><td>' +
            '<button class="btn btn-secondary btn-small" data-h="print" data-i="' + i + '">Imprimir</button> ' +
            '<button class="btn btn-secondary btn-small" data-h="caja" data-i="' + i + '">Abrir en Caja</button></td></tr>';
        }).join('') + '</tbody></table></div>';
    } catch (e) { box.innerHTML = '<span class="aks-bad">' + AKS.esc(e.message) + '</span>'; }
  }

  async function open() {
    try { await AKS.loadProducts(false); rate = await AKS.getRate(); var st = await AKS.getSettings(); company = st.companyName || company; } catch (e) {}
    renderLines(); loadHist();
  }

  AKS.init(function () {
    root = AKS.addSection('cotizaciones', html());
    if (!root) return;
    renderLines();
    $('aksK-q').addEventListener('input', function () {
      $('aksK-res').innerHTML = AKS.searchProducts($('aksK-q').value, 8).map(function (p) {
        return '<div class="aks-result" data-add="' + AKS.esc(p.id) + '"><strong>' + AKS.esc(p.name) + '</strong> <span class="aks-muted">' +
          AKS.esc(p.code) + ' · ' + AKS.usd(AKS.effectivePrice(p)) + '</span></div>';
      }).join('');
    });
    root.addEventListener('click', function (ev) {
      var add = ev.target.closest && ev.target.closest('[data-add]');
      if (add) {
        var p = AKS.products.filter(function (x) { return x.id === add.getAttribute('data-add'); })[0];
        if (p) {
          var ex = lines.filter(function (l) { return l.productId === p.id; })[0];
          if (ex) ex.qty++; else lines.push({ productId: p.id, code: p.code, name: p.name, qty: 1, unitPrice: AKS.effectivePrice(p) });
        }
        $('aksK-res').innerHTML = ''; $('aksK-q').value = ''; renderLines(); return;
      }
      var rm = ev.target.getAttribute && ev.target.getAttribute('data-rm');
      if (rm) { lines.splice(+rm, 1); renderLines(); return; }
      var h = ev.target.getAttribute && ev.target.getAttribute('data-h');
      if (h) {
        var q = saved[+ev.target.getAttribute('data-i')]; if (!q) return;
        if (h === 'print') printQuote(q);
        else if (AKS.caja) {
          q.items.forEach(function (x) {
            var p = AKS.products.filter(function (z) { return z.id === x.productId; })[0];
            if (p) for (var k = 0; k < x.qty; k++) AKS.caja.addProduct(p);
          });
          AKS.caja.open();
        }
      }
    });
    root.addEventListener('change', function (ev) {
      var f = ev.target.getAttribute && ev.target.getAttribute('data-f');
      if (!f) return;
      var l = lines[+ev.target.getAttribute('data-i')];
      if (f === 'qty') l.qty = Math.floor(AKS.num(ev.target.value)); else l.unitPrice = AKS.r2(AKS.num(ev.target.value));
      renderLines();
    });
    $('aksK-save').addEventListener('click', save);
    $('aksK-wa').addEventListener('click', wa);
    $('aksK-clear').addEventListener('click', function () { lines = []; renderLines(); });
    AKS.addMenuItem('Cotizaciones', 'cotizaciones', open, 'ventas');
  });
})();
