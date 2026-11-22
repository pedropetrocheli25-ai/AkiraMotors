// assets/js/admin/cxc.js
// Cuentas por cobrar: ventas a crédito (fiado), apartados y abonos.
// Las ventas a crédito se crean desde la Caja ("Dejar el saldo pendiente").
(function () {
  'use strict';
  var AKS = window.AKS;
  if (!AKS) { console.error('cxc.js: falta sistema-core.js'); return; }
  function $(id) { return document.getElementById(id); }

  var METHODS = [
    { k: 'efectivo_usd', label: 'Efectivo $', cur: 'USD' }, { k: 'zelle', label: 'Zelle $', cur: 'USD' },
    { k: 'efectivo_bs', label: 'Efectivo Bs', cur: 'VES' }, { k: 'pago_movil', label: 'Pago móvil Bs', cur: 'VES' },
    { k: 'punto', label: 'Punto de venta Bs', cur: 'VES' }, { k: 'transferencia', label: 'Transferencia Bs', cur: 'VES' },
    { k: 'usdt', label: 'USDT', cur: 'USDT' }
  ];
  var rows = [], filter = 'open';

  function html() {
    return '<h2 class="section-title">Cuentas por cobrar</h2>' +
      '<div class="admin-card"><div id="aksC-sum" class="aks-muted" style="margin-bottom:.6rem"></div>' +
      '<div class="aks-inline"><select id="aksC-f"><option value="open">Pendientes</option><option value="late">Vencidas</option>' +
      '<option value="apartado">Apartados por entregar</option><option value="paid">Pagadas</option></select>' +
      '<input type="text" id="aksC-q" placeholder="Buscar cliente o factura" style="max-width:240px"></div>' +
      '<div style="overflow-x:auto;margin-top:.6rem"><table class="admin-table"><thead><tr><th>Cliente</th><th>Factura</th><th>Tipo</th>' +
      '<th>Total</th><th>Abonado</th><th>Saldo</th><th>Desde</th><th>Límite</th><th></th></tr></thead><tbody id="aksC-body"></tbody></table></div></div>';
  }

  function isLate(r) { return r.status === 'open' && r.dueDate && r.dueDate < AKS.dateKey(); }

  function render() {
    var q = AKS.norm($('aksC-q').value), f = $('aksC-f').value, tot = 0, n = 0, late = 0;
    rows.forEach(function (r) { if (r.status === 'open') { tot += r.balanceUsd; n++; if (isLate(r)) late++; } });
    $('aksC-sum').innerHTML = 'Por cobrar: <strong>' + AKS.usd(AKS.r2(tot)) + '</strong> en ' + n + ' cuenta(s)' +
      (late ? ' · <span class="aks-bad">' + late + ' vencida(s)</span>' : '');
    var list = rows.filter(function (r) {
      if (q && AKS.norm(r.clientName + ' ' + r.saleNumber).indexOf(q) === -1) return false;
      if (f === 'open') return r.status === 'open';
      if (f === 'late') return isLate(r);
      if (f === 'apartado') return r.type === 'apartado' && r.delivered === false && r.status === 'paid';
      return r.status === 'paid';
    });
    $('aksC-body').innerHTML = list.map(function (r) {
      var acts = '';
      if (r.status === 'open') acts += '<button class="btn btn-primary btn-small" data-act="pay" data-id="' + r._id + '">Abonar</button> ';
      if (r.type === 'apartado' && r.delivered === false && r.status === 'paid') acts += '<button class="btn btn-primary btn-small" data-act="deliver" data-id="' + r._id + '">Entregar</button> ';
      if (r.status === 'open') acts += '<button class="btn btn-secondary btn-small" data-act="wa" data-id="' + r._id + '">Cobrar WhatsApp</button>';
      return '<tr' + (isLate(r) ? ' style="background:#fff0f0"' : '') + '><td>' + AKS.esc(r.clientName) + '<div class="aks-muted">' + AKS.esc(r.clientPhone || '') + '</div></td><td>' +
        AKS.esc(r.saleNumber) + '</td><td>' + (r.type === 'apartado' ? 'Apartado' : 'Fiado') + '</td><td>' + AKS.usd(r.totalUsd) + '</td><td>' + AKS.usd(r.paidUsd) +
        '</td><td><strong>' + AKS.usd(r.balanceUsd) + '</strong></td><td>' + AKS.esc(AKS.fmtDate(r.dateKey)) + '</td><td>' +
        (r.dueDate ? AKS.esc(AKS.fmtDate(r.dueDate)) : '-') + '</td><td>' + acts + '</td></tr>';
    }).join('') || '<tr><td colspan="9" class="aks-muted">Nada por aquí.</td></tr>';
  }

  async function load() {
    $('aksC-body').innerHTML = '<tr><td colspan="9">Cargando...</td></tr>';
    try {
      var snap = await AKS.db().collection('receivables').get();
      rows = [];
      snap.forEach(function (d) { var r = d.data(); r._id = d.id; rows.push(r); });
      rows.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
      render();
    } catch (e) { $('aksC-body').innerHTML = '<tr><td colspan="9" class="aks-bad">' + AKS.esc(e.message) + '</td></tr>'; }
  }

  function modal(inner) {
    var m = document.createElement('div');
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:100000;display:flex;align-items:center;justify-content:center;padding:1rem';
    m.innerHTML = '<div style="background:#fff;border-radius:12px;padding:1.1rem;max-width:420px;width:100%;font-family:Arial,sans-serif;max-height:90vh;overflow:auto">' + inner + '</div>';
    document.body.appendChild(m);
    return m;
  }

  async function pay(r) {
    var rate, usdtRate = 0;
    try { rate = await AKS.getRate(true); } catch (e) { alert(e.message); return; }
    try { var u = await AKS.db().collection('settings').doc('usdtRate').get(); usdtRate = u.exists ? Number(u.data().value) || 0 : 0; } catch (e) { /* sin USDT */ }
    var m = modal('<h3 style="margin:0 0 .3rem">Abono de ' + AKS.esc(r.clientName) + '</h3>' +
      '<div style="color:#555;margin-bottom:.6rem">Factura ' + AKS.esc(r.saleNumber) + ' · Saldo <strong>' + AKS.usd(r.balanceUsd) + '</strong> / ' + AKS.bs(r.balanceUsd * rate) + '</div>' +
      '<select id="aksCp-m" style="width:100%;padding:.6rem;font-size:16px;margin-bottom:.5rem">' +
      METHODS.filter(function (x) { return x.k !== 'usdt' || usdtRate > 0; }).map(function (x) { return '<option value="' + x.k + '">' + x.label + '</option>'; }).join('') + '</select>' +
      '<div style="display:flex;gap:.4rem;margin-bottom:.5rem"><input type="number" id="aksCp-a" step="0.01" min="0" data-money placeholder="Monto" style="flex:1;padding:.6rem;font-size:16px">' +
      '<button type="button" id="aksCp-all" style="padding:.6rem">Todo</button></div>' +
      '<input type="text" id="aksCp-r" maxlength="20" placeholder="Referencia (si es electrónico)" style="width:100%;box-sizing:border-box;padding:.6rem;font-size:16px;margin-bottom:.5rem">' +
      '<div id="aksCp-i" style="color:#555;min-height:1.3rem;margin-bottom:.5rem"></div>' +
      '<div style="display:flex;gap:.5rem"><button id="aksCp-x" style="flex:1;padding:.7rem">Cancelar</button>' +
      '<button id="aksCp-ok" style="flex:1;padding:.7rem;background:#FF6B1A;color:#fff;border:0;font-weight:700">Registrar abono</button></div>');
    function credit() {
      var mt = METHODS.filter(function (x) { return x.k === m.querySelector('#aksCp-m').value; })[0];
      var v = AKS.r2(AKS.num(m.querySelector('#aksCp-a').value));
      var usd = mt.cur === 'VES' ? v / rate : v;
      var cov = mt.cur === 'USDT' ? v * usdtRate / rate : usd;
      return { mt: mt, v: v, usd: AKS.r2(usd), cov: AKS.r2(cov) };
    }
    function info() {
      var c = credit();
      m.querySelector('#aksCp-i').textContent = c.v > 0 ? 'Se descuentan ' + AKS.usd(c.cov) + ' del saldo' + (c.mt.cur === 'VES' ? ' (tasa ' + rate.toFixed(2) + ')' : '') : '';
    }
    m.querySelector('#aksCp-m').onchange = info; m.querySelector('#aksCp-a').oninput = info;
    m.querySelector('#aksCp-all').onclick = function () {
      var mt = METHODS.filter(function (x) { return x.k === m.querySelector('#aksCp-m').value; })[0];
      var all = mt.cur === 'VES' ? r.balanceUsd * rate : (mt.cur === 'USDT' ? r.balanceUsd * rate / usdtRate : r.balanceUsd);
      m.querySelector('#aksCp-a').value = AKS.r2(all); info();
    };
    m.querySelector('#aksCp-x').onclick = function () { m.remove(); };
    m.querySelector('#aksCp-ok').onclick = async function () {
      var c = credit(), ref = m.querySelector('#aksCp-r').value.trim(), btn = this;
      if (!(c.v > 0)) { alert('Escribe el monto'); return; }
      if (c.cov > r.balanceUsd + 0.01) { alert('El abono (' + AKS.usd(c.cov) + ') es mayor que el saldo (' + AKS.usd(r.balanceUsd) + ').'); return; }
      if (c.mt.k.indexOf('efectivo') !== 0 && !ref) { alert('Escribe la referencia del pago'); return; }
      btn.disabled = true;
      try {
        var db = AKS.db(), rRef = db.collection('receivables').doc(r._id), pRef = db.collection('receivablePayments').doc();
        await db.runTransaction(async function (tx) {
          var s = await tx.get(rRef);
          if (!s.exists || s.data().status !== 'open') throw new Error('Esta cuenta ya no está pendiente.');
          var cur = s.data(), bal = AKS.r2(Number(cur.balanceUsd) - c.cov), now = new Date().toISOString();
          tx.set(pRef, { receivableId: r._id, saleId: cur.saleId, saleNumber: cur.saleNumber, clientName: cur.clientName,
            dateKey: AKS.dateKey(), method: c.mt.k, currency: c.mt.cur, amount: c.v, amountUsd: c.usd, creditUsd: c.cov,
            ref: ref, rate: rate, usdtRate: c.mt.cur === 'USDT' ? usdtRate : 0, user: AKS.userLabel(), createdAt: now });
          tx.update(rRef, { paidUsd: AKS.r2(Number(cur.paidUsd) + c.cov), balanceUsd: bal < 0.005 ? 0 : bal,
            status: bal < 0.005 ? 'paid' : 'open', lastPaymentAt: now });
        });
        AKS.log('abono', r.saleNumber + ' ' + r.clientName + ': ' + AKS.usd(c.cov), { receivable: r._id, credit: c.cov });
        m.remove(); await load();
        alert('Abono registrado. Entra en el cierre de caja de hoy.');
      } catch (e) { alert('No se pudo registrar: ' + e.message); btn.disabled = false; }
    };
  }

  async function deliver(r) {
    if (!confirm('¿Confirmas que el cliente retiró el apartado de la factura ' + r.saleNumber + '?')) return;
    try {
      await AKS.db().collection('receivables').doc(r._id).update({ delivered: true, deliveredAt: new Date().toISOString() });
      AKS.log('apartado_entregado', r.saleNumber + ' ' + r.clientName);
      await load();
    } catch (e) { alert('No se pudo guardar: ' + e.message); }
  }

  function remind(r) {
    var ph = String(r.clientPhone || '').replace(/\D/g, '');
    if (/^0\d{10}$/.test(ph)) ph = '58' + ph.slice(1);
    var msg = 'Hola ' + r.clientName + ', te escribimos de Akira Motors. Tienes un saldo pendiente de ' + AKS.usd(r.balanceUsd) +
      ' de la factura ' + r.saleNumber + (r.dueDate ? ' (fecha límite ' + AKS.fmtDate(r.dueDate) + ')' : '') + '. ¡Gracias!';
    window.open('https://wa.me/' + ph + '?text=' + encodeURIComponent(msg), '_blank', 'noopener');
  }

  AKS.init(function () {
    if (!AKS.addSection('cxc', html())) return;
    $('aksC-f').addEventListener('change', render);
    $('aksC-q').addEventListener('input', render);
    $('aksC-body').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-act]'); if (!b) return;
      var r = rows.filter(function (x) { return x._id === b.getAttribute('data-id'); })[0]; if (!r) return;
      var a = b.getAttribute('data-act');
      if (a === 'pay') pay(r); else if (a === 'deliver') deliver(r); else if (a === 'wa') remind(r);
    });
    AKS.addMenuItem('Cuentas por cobrar', 'cxc', load, 'ventas');
  });
})();
