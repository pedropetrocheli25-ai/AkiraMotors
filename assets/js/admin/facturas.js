// assets/js/admin/facturas.js
// Facturas realizadas (ventas de caja): buscar, ver detalle, reimprimir, anular.
// Requiere sistema-core.js y caja.js.
(function () {
  'use strict';
  var AKS = window.AKS;
  if (!AKS) { console.error('facturas.js: falta sistema-core.js'); return; }

  var METHOD = { efectivo_usd: 'Efectivo $', zelle: 'Zelle $', efectivo_bs: 'Efectivo Bs',
    pago_movil: 'Pago móvil', punto: 'Punto de venta', transferencia: 'Transferencia', usdt: 'USDT' };
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
          '<button class="btn btn-secondary btn-small" data-act="pdf" data-i="' + i + '">PDF</button> ' +
          '<button class="btn btn-secondary btn-small" data-act="wa" data-i="' + i + '">WhatsApp</button> ' +
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
    if (s.refunds && s.refunds.length) {
      h += '<div class="aks-muted" style="margin-top:.4rem">Devoluciones: ' + s.refunds.map(function (r) {
        return AKS.esc(AKS.fmtDateTime(r.at)) + ' · ' + AKS.usd(r.amountUsd) + ' por ' + AKS.esc(METHOD[r.method] || r.method) +
          (r.reason ? ' (' + AKS.esc(r.reason) + ')' : '');
      }).join('; ') + '</div>';
    }
    if (s.status === 'completed') {
      h += '<div data-ret="' + AKS.esc(s._id) + '" style="margin-top:.6rem;padding-top:.5rem;border-top:1px dashed #ccc">' +
        '<strong>Devolución parcial</strong> <span class="aks-muted">(cantidad a devolver por producto)</span><br>' +
        (s.items || []).map(function (x, k) {
          return '<label style="display:inline-block;margin:.3rem .8rem .3rem 0">' + AKS.esc(x.name) + ' (máx. ' + x.qty +
            ') <input type="number" min="0" max="' + x.qty + '" step="any" value="0" data-rq="' + k + '" style="width:70px"></label>';
        }).join('') + '<div class="aks-inline" style="margin-top:.4rem"><select data-rm>' +
        Object.keys(METHOD).map(function (m) { return '<option value="' + m + '">Reembolso: ' + METHOD[m] + '</option>'; }).join('') +
        '</select><input type="text" data-rr placeholder="Motivo" style="min-width:200px">' +
        '<button class="btn btn-danger btn-small" data-act="doreturn" data-id="' + AKS.esc(s._id) + '">Registrar devolución</button></div></div>';
    }
    if (s.status !== 'completed') {
      h += '<div class="aks-bad">Anulada por ' + AKS.esc(s.voidedBy || '') + ': ' + AKS.esc(s.voidReason || '') + '</div>';
    }
    return h + '</div>';
  }

  async function doReturn(btn) {
    var box = btn.closest('[data-ret]'), id = btn.getAttribute('data-id');
    var qtys = {}, any = false;
    box.querySelectorAll('[data-rq]').forEach(function (i) {
      var q = AKS.q(AKS.num(i.value));
      if (q > 0) { qtys[i.getAttribute('data-rq')] = q; any = true; }
    });
    if (!any) { alert('Escribe la cantidad a devolver'); return; }
    var method = box.querySelector('[data-rm]').value, reason = box.querySelector('[data-rr]').value.trim();
    if (!reason) { alert('Escribe el motivo'); return; }
    if (!confirm('¿Registrar la devolución? El stock se repone y la factura se reduce.')) return;
    var db = AKS.db(), res = null;
    btn.disabled = true;
    try {
      await db.runTransaction(async function (tx) {
        var ref = db.collection('sales').doc(id), cur = await tx.get(ref);
        if (!cur.exists || cur.data().status !== 'completed') throw new Error('La venta ya no está activa.');
        var s = cur.data(), items = s.items.map(function (x) { return Object.assign({}, x); });
        var keys = Object.keys(qtys), snaps = {}, k, it;
        for (k = 0; k < keys.length; k++) {
          it = items[keys[k]];
          if (!it || qtys[keys[k]] > it.qty) throw new Error('Cantidad mayor a la vendida.');
          if (!snaps[it.productId]) snaps[it.productId] = await tx.get(db.collection('products').doc(it.productId));
        }
        var cRef = s.clientId ? db.collection('clients').doc(s.clientId) : null;
        var cSnap = cRef ? await tx.get(cRef) : null;
        var costBack = 0, now = new Date().toISOString(), added = {};
        for (k = 0; k < keys.length; k++) {
          it = items[keys[k]]; var q = qtys[keys[k]];
          it.qty -= q; it.lineTotal = AKS.r2(it.qty * it.unitPrice); costBack += (it.unitCost || 0) * q;
          var sn = snaps[it.productId];
          if (sn.exists) {
            var before = (Number(sn.data().stock) || 0) + (added[it.productId] || 0), after = AKS.q(before + q);
            added[it.productId] = (added[it.productId] || 0) + q;
            tx.update(db.collection('products').doc(it.productId), { stock: after, updatedAt: now });
            AKS.movement(tx, { productId: it.productId, code: it.code, name: it.name, type: 'devolucion', qty: q,
              stockBefore: before, stockAfter: after, refType: 'sale', refId: id });
          }
        }
        var remaining = items.filter(function (x) { return x.qty > 0; });
        if (!remaining.length) throw new Error('Se devolvería todo: usa "Anular" en su lugar.');
        var sub = AKS.r2(items.reduce(function (a, x) { return a + x.qty * x.unitPrice; }, 0));
        var ratio = s.subtotal > 0 ? (s.discount || 0) / s.subtotal : 0;
        var disc = AKS.r2(sub * ratio), total = AKS.r2(sub - disc), refund = AKS.r2(s.totalUsd - total);
        var cur2 = METHOD[method] && /_bs$|movil|punto|transferencia/.test(method) ? 'VES' : 'USD';
        var amount = cur2 === 'USD' ? refund : AKS.r2(refund * s.rate);
        var refunds = (s.refunds || []).concat([{ at: now, by: AKS.userLabel(), reason: reason, method: method,
          currency: cur2, amount: amount, amountUsd: refund }]);
        tx.update(ref, { items: items, subtotal: sub, discount: disc, totalUsd: total, totalBs: AKS.r2(total * s.rate),
          costUsd: AKS.r2((s.costUsd || 0) - costBack), profitUsd: AKS.r2(total - ((s.costUsd || 0) - costBack)), refunds: refunds });
        if (cSnap && cSnap.exists) {
          tx.update(cRef, { totalSpentUsd: Math.max(0, AKS.r2((Number(cSnap.data().totalSpentUsd) || 0) - refund)) });
        }
        res = { refund: refund, amount: amount, cur: cur2 };
      });
      AKS.log('devolucion', (s.saleNumber || '') + ' devolución $' + res.refund + '. ' + reason, { saleNumber: s.saleNumber, refund: res.refund });
      alert('Devolución registrada. Devuelve al cliente ' + (res.cur === 'USD' ? AKS.usd(res.amount) : AKS.bs(res.amount)) + '.');
      AKS.refreshAdminProducts();
      if (AKS.clientes) AKS.clientes.load(true).catch(function () {});
      await search();
    } catch (e) { console.error(e); alert('No se pudo registrar: ' + e.message); btn.disabled = false; }
  }

  function bind() {
    $('aksF-go').addEventListener('click', search);
    $('aksF-status').addEventListener('change', function () { render(false); });
    $('aksF-q').addEventListener('input', function () { render(false); });
    root.addEventListener('click', function (ev) {
      var act = ev.target.getAttribute && ev.target.getAttribute('data-act');
      if (!act) return;
      if (act === 'doreturn') { doReturn(ev.target); return; }
      var i = parseInt(ev.target.getAttribute('data-i'), 10), s = rows[i];
      if (!s) return;
      if (act === 'view') {
        var r = $('aksF-d-' + i);
        r.style.display = r.style.display === 'none' ? '' : 'none';
      } else if (act === 'print') {
        if (AKS.caja) AKS.caja.printReceipt(s);
      } else if (act === 'pdf') {
        if (AKS.caja) AKS.caja.downloadPdf(s);
      } else if (act === 'wa') {
        if (AKS.caja) AKS.caja.sendWhatsApp(s);
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
