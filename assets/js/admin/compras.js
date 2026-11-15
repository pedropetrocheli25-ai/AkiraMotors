// assets/js/admin/compras.js
// Compras / facturas de proveedor + historial de costos y precios.
// Requiere sistema-core.js (window.AKS). Script clásico.
(function () {
  'use strict';
  var AKS = window.AKS;
  if (!AKS) { console.error('compras.js: falta sistema-core.js'); return; }

  var MAX_ITEMS = 80; // 4 escrituras por ítem, límite de 500 por transacción
  var items = [];
  var rate = 0;
  var saving = false;
  var root = null;

  // ----------------------------------------------------------
  // HTML base de la sección
  // ----------------------------------------------------------
  function html() {
    return '' +
      '<h2 class="section-title">Compras y facturas de proveedor</h2>' +
      '<div class="alert-info">Registra aquí la factura que te entrega ' +
      'el proveedor. Al guardar, el sistema <strong>suma el stock</strong>, ' +
      '<strong>actualiza el costo</strong> de cada producto, te sugiere ' +
      'el precio de venta según tu margen y guarda el cambio en el ' +
      'historial. Los precios se cargan en <strong>dólares ($)</strong>.' +
      '</div>' +

      '<div class="admin-card"><h3>Nueva factura de compra</h3>' +
      '<div class="form-row-3">' +
      '<div class="form-group"><label>Proveedor *</label>' +
      '<input type="text" id="aksC-supplier" list="aksC-suppliers" ' +
      'placeholder="Ej: Repuestos Orinoco" maxlength="80">' +
      '<datalist id="aksC-suppliers"></datalist></div>' +
      '<div class="form-group"><label>N° de factura *</label>' +
      '<input type="text" id="aksC-invoice" maxlength="40" ' +
      'placeholder="Ej: 00012345"></div>' +
      '<div class="form-group"><label>Fecha de la factura *</label>' +
      '<input type="date" id="aksC-date"></div>' +
      '</div>' +

      '<div class="form-group"><label>Agregar producto (nombre, ' +
      'código, marca o N° de parte)</label>' +
      '<input type="text" id="aksC-search" class="aks-search" ' +
      'placeholder="Escribe para buscar..." autocomplete="off">' +
      '<div id="aksC-results" class="aks-results"></div></div>' +

      '<div class="aks-wrap"><table class="aks-table">' +
      '<thead><tr><th>Producto</th><th>Cant.</th>' +
      '<th>Costo unit. ($)</th><th>Costo anterior</th>' +
      '<th>Precio venta ($)</th><th>Margen</th>' +
      '<th>Total línea</th><th></th></tr></thead>' +
      '<tbody id="aksC-body"></tbody></table></div>' +
      '<div id="aksC-empty" class="aks-muted" ' +
      'style="padding:.8rem 0;">Aún no agregaste productos.</div>' +

      '<div class="aks-total"><div class="aks-row"><span>Total factura</span>' +
      '<span class="big" id="aksC-total">$0.00</span></div>' +
      '<div class="aks-row"><span class="aks-muted">Equivalente en Bs ' +
      '(tasa <span id="aksC-rate">-</span>)</span>' +
      '<span class="sub" id="aksC-totalBs">Bs. 0,00</span></div></div>' +

      '<div class="form-group"><label>Notas (opcional)</label>' +
      '<input type="text" id="aksC-notes" maxlength="200"></div>' +
      '<div class="aks-inline">' +
      '<button class="btn btn-primary" id="aksC-save">' +
      'Guardar factura y actualizar inventario</button>' +
      '<button class="btn btn-secondary" id="aksC-clear">' +
      'Limpiar</button></div></div>' +

      '<div class="admin-card"><h3>Facturas registradas</h3>' +
      '<div id="aksC-list" class="aks-muted">Cargando...</div></div>' +

      '<div class="admin-card"><h3>Historial de costos y precios ' +
      'por producto</h3>' +
      '<div class="form-group"><label>Buscar producto</label>' +
      '<input type="text" id="aksC-hsearch" class="aks-search" ' +
      'placeholder="Nombre o código..." autocomplete="off">' +
      '<div id="aksC-hresults" class="aks-results"></div></div>' +
      '<div id="aksC-history"></div></div>';
  }

  function $(id) { return document.getElementById(id); }

  // ----------------------------------------------------------
  // Cálculos de una línea
  // ----------------------------------------------------------
  function marginOf(price, cost) {
    if (!(price > 0)) return 0;
    return (price - cost) / price * 100;
  }

  function suggestedPrice(it) {
    var m = it.prevMargin;
    if (!(m >= 0 && m < 99)) m = 30;
    return AKS.r2(it.unitCost / (1 - m / 100));
  }

  function lineTotal(it) {
    return AKS.r2(it.qty * it.unitCost);
  }

  // ----------------------------------------------------------
  // Render de la tabla (solo cuando cambia la lista)
  // ----------------------------------------------------------
  function renderItems() {
    var body = $('aksC-body');
    if (!body) return;
    var h = '';
    items.forEach(function (it, i) {
      h += '<tr data-i="' + i + '">' +
        '<td><strong>' + AKS.esc(it.name) + '</strong><br>' +
        '<span class="aks-muted">' + AKS.esc(it.code) +
        ' · stock actual: ' + it.stock + '</span></td>' +
        '<td><input type="number" class="qty" min="1" step="1" ' +
        'data-f="qty" value="' + it.qty + '"></td>' +
        '<td><input type="number" min="0" step="0.01" ' +
        'data-f="cost" value="' + (it.unitCost || '') + '"></td>' +
        '<td>' + AKS.usd(it.prevCost) + '</td>' +
        '<td><input type="number" min="0" step="0.01" ' +
        'data-f="price" id="aksC-price-' + i + '" value="' +
        (it.newPrice || '') + '"><br>' +
        '<span class="aks-muted">antes: ' + AKS.usd(it.prevPrice) +
        '</span></td>' +
        '<td id="aksC-margin-' + i + '"></td>' +
        '<td id="aksC-line-' + i + '"></td>' +
        '<td><button class="btn btn-danger btn-small" ' +
        'data-act="remove">Quitar</button></td></tr>';
    });
    body.innerHTML = h;
    $('aksC-empty').style.display = items.length ? 'none' : 'block';
    items.forEach(function (it, i) { refreshRow(i); });
    refreshTotals();
  }

  function refreshRow(i) {
    var it = items[i];
    if (!it) return;
    var m = marginOf(it.newPrice, it.unitCost);
    var cell = $('aksC-margin-' + i);
    if (cell) {
      cell.innerHTML = '<span class="' + (m < 0 ? 'aks-bad' : '') + '">' +
        m.toFixed(1) + '%</span>' +
        (m < 0 ? '<br><span class="aks-bad">bajo el costo</span>' : '');
    }
    var l = $('aksC-line-' + i);
    if (l) l.textContent = AKS.usd(lineTotal(it));
  }

  function refreshTotals() {
    var total = 0;
    items.forEach(function (it) { total += lineTotal(it); });
    total = AKS.r2(total);
    $('aksC-total').textContent = AKS.usd(total);
    $('aksC-totalBs').textContent = rate ? AKS.bs(total * rate) : '-';
    $('aksC-rate').textContent = rate ? rate.toFixed(2) : '-';
  }

  // ----------------------------------------------------------
  // Agregar producto a la factura
  // ----------------------------------------------------------
  async function addItem(p) {
    var existing = items.filter(function (x) {
      return x.productId === p.id;
    })[0];
    if (existing) { existing.qty += 1; renderItems(); return; }
    if (items.length >= MAX_ITEMS) {
      alert('Máximo ' + MAX_ITEMS + ' productos por factura. ' +
        'Divide la factura en dos.');
      return;
    }
    var prevCost = 0, prevMargin = null;
    try {
      var c = await AKS.db().collection('productCosts').doc(p.id).get();
      if (c.exists) {
        prevCost = Number(c.data().costPrice) || 0;
        prevMargin = Number(c.data().margin);
        if (!isFinite(prevMargin)) prevMargin = null;
      }
    } catch (e) { console.error('productCosts:', e); }
    if (prevMargin === null) {
      prevMargin = (prevCost > 0 && p.price > 0)
        ? marginOf(p.price, prevCost) : 30;
    }
    var it = {
      productId: p.id, code: p.code, name: p.name, stock: p.stock,
      qty: 1, unitCost: prevCost, prevCost: prevCost,
      prevPrice: p.price, prevMargin: prevMargin,
      newPrice: p.price, priceTouched: false
    };
    if (!(it.unitCost > 0)) it.newPrice = p.price;
    items.push(it);
    renderItems();
  }

  // ----------------------------------------------------------
  // Búsqueda de productos (para agregar a la factura)
  // ----------------------------------------------------------
  function renderResults(boxId, q, onPick) {
    var box = $(boxId);
    if (!box) return;
    var found = AKS.searchProducts(q, 10);
    if (!q.trim()) { box.innerHTML = ''; return; }
    if (!found.length) {
      box.innerHTML = '<div class="aks-muted">Sin resultados.</div>';
      return;
    }
    box.innerHTML = found.map(function (p) {
      return '<div class="aks-result" data-id="' + AKS.esc(p.id) + '">' +
        '<div><strong>' + AKS.esc(p.name) + '</strong>' +
        '<small>' + AKS.esc(p.code) + ' · ' + AKS.esc(p.brand) +
        ' · stock ' + p.stock + '</small></div>' +
        '<div><strong>' + AKS.usd(p.price) + '</strong></div></div>';
    }).join('');
    Array.prototype.forEach.call(
      box.querySelectorAll('.aks-result'),
      function (el) {
        el.addEventListener('click', function () {
          var id = el.getAttribute('data-id');
          var p = AKS.products.filter(function (x) {
            return x.id === id;
          })[0];
          if (p) onPick(p);
        });
      }
    );
  }

  // ----------------------------------------------------------
  // Guardar factura (transacción: lecturas primero, luego escrituras)
  // ----------------------------------------------------------
  async function save() {
    if (saving) return;
    var supplier = $('aksC-supplier').value.trim();
    var invoice = $('aksC-invoice').value.trim();
    var date = $('aksC-date').value;
    var notes = $('aksC-notes').value.trim();

    if (!supplier) { alert('Escribe el proveedor'); return; }
    if (!invoice) { alert('Escribe el número de factura'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      alert('Elige la fecha de la factura'); return;
    }
    if (!items.length) { alert('Agrega al menos un producto'); return; }

    var below = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!(Number.isInteger(it.qty) && it.qty >= 1)) {
        alert('Cantidad inválida en "' + it.name + '"'); return;
      }
      if (!(it.unitCost > 0)) {
        alert('Costo inválido en "' + it.name + '"'); return;
      }
      if (!(it.newPrice > 0)) {
        alert('Precio de venta inválido en "' + it.name + '"'); return;
      }
      if (it.newPrice < it.unitCost) below.push(it.name);
    }
    if (below.length &&
        !confirm('Estos productos quedan con precio de venta por ' +
          'DEBAJO del costo:\n\n' + below.join('\n') +
          '\n\n¿Guardar de todas formas?')) return;

    saving = true;
    var btn = $('aksC-save');
    btn.disabled = true;
    btn.textContent = 'Guardando...';
    var db = AKS.db();

    try {
      // Factura repetida del mismo proveedor
      var supplierKey = AKS.norm(supplier);
      var dup = await db.collection('purchases')
        .where('supplierKey', '==', supplierKey)
        .where('invoiceNumber', '==', invoice).limit(1).get();
      if (!dup.empty) {
        alert('Esa factura ya fue registrada para este proveedor.');
        return;
      }

      var purchaseRef = db.collection('purchases').doc();
      var nowIso = new Date().toISOString();
      var total = 0;
      items.forEach(function (x) { total += lineTotal(x); });
      total = AKS.r2(total);
      var user = AKS.userLabel();

      await db.runTransaction(async function (tx) {
        // ---- LECTURAS ----
        var prodSnaps = [], costSnaps = [];
        for (var a = 0; a < items.length; a++) {
          prodSnaps.push(await tx.get(
            db.collection('products').doc(items[a].productId)));
        }
        for (var b = 0; b < items.length; b++) {
          costSnaps.push(await tx.get(
            db.collection('productCosts').doc(items[b].productId)));
        }
        for (var c = 0; c < items.length; c++) {
          if (!prodSnaps[c].exists) {
            throw new Error('El producto "' + items[c].name +
              '" ya no existe.');
          }
        }

        // ---- ESCRITURAS ----
        var lines = [];
        for (var k = 0; k < items.length; k++) {
          var x = items[k];
          var pd = prodSnaps[k].data();
          var stockBefore = Number(pd.stock) || 0;
          var stockAfter = stockBefore + x.qty;
          var costBefore = costSnaps[k].exists
            ? (Number(costSnaps[k].data().costPrice) || 0) : 0;
          var priceBefore = Number(pd.price) || 0;
          var margin = AKS.r2(Math.max(0, Math.min(99.99,
            marginOf(x.newPrice, x.unitCost))));

          tx.update(db.collection('products').doc(x.productId), {
            stock: stockAfter,
            price: x.newPrice,
            updatedAt: nowIso
          });
          tx.set(db.collection('productCosts').doc(x.productId), {
            costPrice: x.unitCost,
            margin: margin,
            updatedAt: nowIso
          }, { merge: true });
          tx.set(db.collection('costHistory').doc(), {
            productId: x.productId, code: x.code, name: x.name,
            type: 'compra', refId: purchaseRef.id,
            supplier: supplier, invoiceNumber: invoice,
            costBefore: costBefore, costAfter: x.unitCost,
            priceBefore: priceBefore, priceAfter: x.newPrice,
            qty: x.qty, dateKey: date, user: user, createdAt: nowIso
          });
          AKS.movement(tx, {
            productId: x.productId, code: x.code, name: x.name,
            type: 'compra', qty: x.qty,
            stockBefore: stockBefore, stockAfter: stockAfter,
            refType: 'purchase', refId: purchaseRef.id
          });
          lines.push({
            productId: x.productId, code: x.code, name: x.name,
            qty: x.qty, unitCost: x.unitCost,
            costBefore: costBefore,
            priceBefore: priceBefore, priceAfter: x.newPrice,
            lineTotal: lineTotal(x)
          });
        }
        tx.set(purchaseRef, {
          supplier: supplier, supplierKey: supplierKey,
          invoiceNumber: invoice, invoiceDate: date,
          items: lines, itemCount: lines.length,
          totalUsd: total, notes: notes,
          user: user, createdAt: nowIso
        });
      });

      alert('Factura guardada. Inventario y costos actualizados.');
      items = [];
      $('aksC-supplier').value = '';
      $('aksC-invoice').value = '';
      $('aksC-notes').value = '';
      renderItems();
      AKS.refreshAdminProducts();
      await loadList();
    } catch (e) {
      console.error('Error guardando factura:', e);
      alert('No se pudo guardar la factura: ' + e.message);
    } finally {
      saving = false;
      btn.disabled = false;
      btn.textContent = 'Guardar factura y actualizar inventario';
    }
  }

  // ----------------------------------------------------------
  // Lista de facturas
  // ----------------------------------------------------------
  async function loadList() {
    var box = $('aksC-list');
    if (!box) return;
    try {
      var snap = await AKS.db().collection('purchases')
        .orderBy('createdAt', 'desc').limit(40).get();
      if (snap.empty) {
        box.innerHTML = 'Todavía no hay facturas registradas.';
        return;
      }
      var suppliers = {};
      var h = '<div class="aks-wrap"><table class="aks-table"><thead><tr>' +
        '<th>Fecha</th><th>Proveedor</th><th>Factura</th>' +
        '<th>Productos</th><th>Total</th><th></th></tr></thead><tbody>';
      snap.forEach(function (d) {
        var p = d.data();
        suppliers[p.supplier] = true;
        h += '<tr><td>' + AKS.esc(AKS.fmtDate(p.invoiceDate)) + '</td>' +
          '<td>' + AKS.esc(p.supplier) + '</td>' +
          '<td>' + AKS.esc(p.invoiceNumber) + '</td>' +
          '<td>' + (p.itemCount || 0) + '</td>' +
          '<td>' + AKS.usd(p.totalUsd) + '</td>' +
          '<td><button class="btn btn-secondary btn-small" ' +
          'data-act="detail" data-id="' + d.id + '">Ver</button></td></tr>' +
          '<tr id="aksC-d-' + d.id + '" style="display:none"><td colspan="6">' +
          detailHtml(p) + '</td></tr>';
      });
      h += '</tbody></table></div>';
      box.innerHTML = h;
      var dl = $('aksC-suppliers');
      if (dl) {
        dl.innerHTML = Object.keys(suppliers).map(function (s) {
          return '<option value="' + AKS.esc(s) + '">';
        }).join('');
      }
    } catch (e) {
      console.error('Error cargando facturas:', e);
      box.innerHTML = '<span class="aks-bad">No se pudieron cargar ' +
        'las facturas: ' + AKS.esc(e.message) + '</span>';
    }
  }

  function detailHtml(p) {
    var h = '<div class="aks-detail">';
    h += '<div class="aks-muted">Registrada por ' + AKS.esc(p.user) +
      ' el ' + AKS.esc(AKS.fmtDateTime(p.createdAt)) + '</div>';
    if (p.notes) h += '<div>Notas: ' + AKS.esc(p.notes) + '</div>';
    h += '<table class="aks-table"><thead><tr><th>Producto</th>' +
      '<th>Cant.</th><th>Costo</th><th>Costo antes</th>' +
      '<th>Precio antes → después</th></tr></thead><tbody>';
    (p.items || []).forEach(function (x) {
      h += '<tr><td>' + AKS.esc(x.name) + '<br><span class="aks-muted">' +
        AKS.esc(x.code) + '</span></td><td>' + x.qty + '</td><td>' +
        AKS.usd(x.unitCost) + '</td><td>' + AKS.usd(x.costBefore) +
        '</td><td>' + AKS.usd(x.priceBefore) + ' → ' +
        AKS.usd(x.priceAfter) + '</td></tr>';
    });
    h += '</tbody></table></div>';
    return h;
  }

  // ----------------------------------------------------------
  // Historial de costos / precios de un producto
  // ----------------------------------------------------------
  function chartSvg(rows) {
    var W = 640, H = 200, P = 34;
    var vals = [];
    rows.forEach(function (r) {
      vals.push(r.costAfter, r.priceAfter);
    });
    var max = Math.max.apply(null, vals), min = Math.min.apply(null, vals);
    if (max === min) { max = max + 1; min = Math.max(0, min - 1); }
    function X(i) {
      return rows.length === 1 ? W / 2
        : P + (W - 2 * P) * i / (rows.length - 1);
    }
    function Y(v) { return H - P - (H - 2 * P) * (v - min) / (max - min); }
    function line(key, color) {
      var pts = rows.map(function (r, i) {
        return X(i).toFixed(1) + ',' + Y(r[key]).toFixed(1);
      }).join(' ');
      var dots = rows.map(function (r, i) {
        return '<circle cx="' + X(i).toFixed(1) + '" cy="' +
          Y(r[key]).toFixed(1) + '" r="3.5" fill="' + color + '"/>';
      }).join('');
      return '<polyline fill="none" stroke="' + color +
        '" stroke-width="2.5" points="' + pts + '"/>' + dots;
    }
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" ' +
      'style="width:100%;max-width:680px;background:#fff;' +
      'border:1px solid #eee;border-radius:10px" role="img" ' +
      'aria-label="Evolución del costo y del precio de venta">' +
      '<text x="6" y="14" font-size="11" fill="#777">$' +
      max.toFixed(2) + '</text>' +
      '<text x="6" y="' + (H - P + 14) + '" font-size="11" ' +
      'fill="#777">$' + min.toFixed(2) + '</text>' +
      line('costAfter', '#FF6B1A') + line('priceAfter', '#111111') +
      '</svg>' +
      '<div class="aks-muted" style="margin:.3rem 0 .8rem">' +
      '<span style="color:#FF6B1A;font-weight:700">● Costo</span> &nbsp; ' +
      '<span style="color:#111;font-weight:700">● Precio de venta</span>' +
      '</div>';
  }

  async function showHistory(p) {
    var box = $('aksC-history');
    box.innerHTML = '<div class="aks-muted">Cargando historial...</div>';
    try {
      var snap = await AKS.db().collection('costHistory')
        .where('productId', '==', p.id).get();
      var rows = [];
      snap.forEach(function (d) { rows.push(d.data()); });
      rows.sort(function (a, b) {
        return String(a.createdAt).localeCompare(String(b.createdAt));
      });
      var h = '<h3 style="margin:.6rem 0">' + AKS.esc(p.name) +
        ' <span class="aks-muted">(' + AKS.esc(p.code) + ')</span></h3>';
      if (!rows.length) {
        box.innerHTML = h + '<div class="aks-muted">Este producto ' +
          'todavía no tiene cambios registrados. Se guardan al ' +
          'registrar facturas de compra o al editar costos y precios.</div>';
        return;
      }
      h += chartSvg(rows);
      h += '<div class="aks-wrap"><table class="aks-table"><thead><tr>' +
        '<th>Fecha</th><th>Origen</th><th>Costo</th><th>Var. costo</th>' +
        '<th>Precio venta</th><th>Proveedor / Factura</th></tr></thead><tbody>';
      rows.slice().reverse().forEach(function (r) {
        var varPct = r.costBefore > 0
          ? ((r.costAfter - r.costBefore) / r.costBefore * 100) : null;
        var varTxt = varPct === null ? '-' :
          '<span class="' + (varPct > 0 ? 'aks-bad' : 'aks-ok') + '">' +
          (varPct > 0 ? '+' : '') + varPct.toFixed(1) + '%</span>';
        var origen = r.type === 'compra' ? 'Factura de compra'
          : (r.type === 'alta' ? 'Alta del producto' : 'Edición manual');
        h += '<tr><td>' + AKS.esc(AKS.fmtDateTime(r.createdAt)) + '</td>' +
          '<td>' + origen + '</td>' +
          '<td>' + AKS.usd(r.costBefore) + ' → ' + AKS.usd(r.costAfter) +
          '</td><td>' + varTxt + '</td>' +
          '<td>' + AKS.usd(r.priceBefore) + ' → ' + AKS.usd(r.priceAfter) +
          '</td><td>' + AKS.esc(r.supplier || '') +
          (r.invoiceNumber ? ' · ' + AKS.esc(r.invoiceNumber) : '') +
          '</td></tr>';
      });
      h += '</tbody></table></div>';
      box.innerHTML = h;
    } catch (e) {
      console.error('Historial:', e);
      box.innerHTML = '<span class="aks-bad">No se pudo cargar: ' +
        AKS.esc(e.message) + '</span>';
    }
  }

  // ----------------------------------------------------------
  // Eventos
  // ----------------------------------------------------------
  function bind() {
    root.addEventListener('input', function (ev) {
      var t = ev.target;
      if (t.id === 'aksC-search') {
        renderResults('aksC-results', t.value, function (p) {
          addItem(p);
          t.value = '';
          $('aksC-results').innerHTML = '';
        });
        return;
      }
      if (t.id === 'aksC-hsearch') {
        renderResults('aksC-hresults', t.value, function (p) {
          $('aksC-hresults').innerHTML = '';
          t.value = '';
          showHistory(p);
        });
        return;
      }
      var f = t.getAttribute('data-f');
      if (!f) return;
      var tr = t.closest('tr');
      var i = tr ? parseInt(tr.getAttribute('data-i'), 10) : -1;
      var it = items[i];
      if (!it) return;
      if (f === 'qty') {
        it.qty = parseInt(t.value, 10) || 0;
      } else if (f === 'cost') {
        it.unitCost = AKS.num(t.value);
        if (!it.priceTouched) {
          it.newPrice = suggestedPrice(it);
          var pi = $('aksC-price-' + i);
          if (pi) pi.value = it.newPrice || '';
        }
      } else if (f === 'price') {
        it.newPrice = AKS.num(t.value);
        it.priceTouched = true;
      }
      refreshRow(i);
      refreshTotals();
    });

    root.addEventListener('click', function (ev) {
      var t = ev.target;
      var act = t.getAttribute && t.getAttribute('data-act');
      if (act === 'remove') {
        var tr = t.closest('tr');
        var i = parseInt(tr.getAttribute('data-i'), 10);
        items.splice(i, 1);
        renderItems();
      } else if (act === 'detail') {
        var row = $('aksC-d-' + t.getAttribute('data-id'));
        if (row) {
          row.style.display = row.style.display === 'none' ? '' : 'none';
        }
      } else if (t.id === 'aksC-save') {
        save();
      } else if (t.id === 'aksC-clear') {
        if (!items.length || confirm('¿Vaciar la factura actual?')) {
          items = [];
          renderItems();
        }
      }
    });
  }

  // ----------------------------------------------------------
  // Apertura de la sección
  // ----------------------------------------------------------
  async function open() {
    try {
      await AKS.loadProducts(true);
      rate = await AKS.getRate(true);
    } catch (e) {
      console.error(e);
      alert(e.message);
    }
    if (!$('aksC-date').value) $('aksC-date').value = AKS.dateKey();
    renderItems();
    loadList();
  }

  AKS.init(function () {
    root = AKS.addSection('compras', html());
    if (!root) return;
    bind();
    AKS.addMenuItem('Compras / Facturas', 'compras', open);
  });

  // Exponer para pruebas
  AKS.compras = { open: open, save: save, addItem: addItem,
    getItems: function () { return items; } };
})();
