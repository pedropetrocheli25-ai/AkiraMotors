// assets/js/admin/cierre.js
// Cierre de caja: lo esperado según las facturas contra lo contado.
// Requiere sistema-core.js.
(function () {
  'use strict';
  var AKS = window.AKS;
  if (!AKS) { console.error('cierre.js: falta sistema-core.js'); return; }

  var METHODS = [
    { k: 'efectivo_usd', label: 'Efectivo $', cur: 'USD' },
    { k: 'zelle', label: 'Zelle $', cur: 'USD' },
    { k: 'efectivo_bs', label: 'Efectivo Bs', cur: 'VES' },
    { k: 'pago_movil', label: 'Pago móvil Bs', cur: 'VES' },
    { k: 'punto', label: 'Punto de venta Bs', cur: 'VES' },
    { k: 'transferencia', label: 'Transferencia Bs', cur: 'VES' },
    { k: 'usdt', label: 'USDT', cur: 'USDT' }
  ];
  var abonosUsd = 0, openings = {};
  var root = null, expected = {}, nSales = 0, totalUsd = 0, changeUsd = 0, outflows = 0, outList = [], elec = [];
  function $(id) { return document.getElementById(id); }
  function fmt(m, v) {
    return m.cur === 'USD' ? AKS.usd(v) : (m.cur === 'USDT' ? Number(v).toFixed(2) + ' USDT' : AKS.bs(v));
  }

  function html() {
    return '<h2 class="section-title">Apertura y cierre de caja</h2>' +
      '<div class="admin-card"><h3>Apertura de caja</h3>' +
      '<div class="alert-info">Registra con cuánto efectivo empiezas el turno. El cierre lo toma solo como fondo inicial.</div>' +
      '<div class="aks-inline"><label class="aks-muted">Efectivo $ <input type="number" id="aksQ-ou" min="0" step="0.01" data-money value="0" style="width:110px"></label>' +
      '<label class="aks-muted">Efectivo Bs <input type="number" id="aksQ-ob" min="0" step="0.01" data-money value="0" style="width:130px"></label>' +
      '<button class="btn btn-primary" id="aksQ-osave">Registrar apertura</button></div>' +
      '<div id="aksQ-olist" class="aks-muted" style="margin-top:.5rem"></div></div>' +
      '<div class="admin-card"><h3>Cierre de caja</h3>' + 

      '<div class="aks-inline"><label class="aks-muted">Fecha ' +
      '<input type="date" id="aksQ-date"></label><button class="btn btn-secondary" id="aksQ-load">Calcular</button></div>' +
      '<div id="aksQ-info" class="aks-muted" style="margin:.6rem 0"></div>' +
      '<div class="aks-wrap"><table class="aks-table"><thead><tr><th>Método</th><th>Fondo inicial</th>' +
      '<th>Esperado según facturas</th><th>Contado</th><th>Diferencia</th></tr></thead><tbody id="aksQ-body"></tbody></table></div>' +
      '<div id="aksQ-elec"></div>' +
      '<div class="alert-info" style="margin-top:.6rem">El vuelto se descuenta del Efectivo $. El fondo inicial es el efectivo con el que abriste la caja.</div>' +
      '<div class="form-group"><label>Notas</label><input type="text" id="aksQ-notes" maxlength="200"></div>' +
      '<button class="btn btn-primary" id="aksQ-save">Guardar cierre</button></div>' +
      '<div class="admin-card"><h3>Cierres anteriores</h3><div id="aksQ-hist" class="aks-muted">Cargando...</div></div>';
  }

  function inputRow(m) {
    var cash = m.k === 'efectivo_usd' || m.k === 'efectivo_bs';
    return '<tr><td><strong>' + m.label + '</strong></td><td>' +
      (cash ? '<input type="number" step="0.01" min="0" data-open="' + m.k + '" value="0" style="width:110px">' : '-') +
      '</td><td id="aksQ-exp-' + m.k + '"></td><td><input type="number" step="0.01" min="0" data-cnt="' + m.k +
      '" style="width:120px"></td><td id="aksQ-dif-' + m.k + '"></td></tr>';
  }

  function recalc() {
    METHODS.forEach(function (m) {
      var op = AKS.num(root.querySelector('[data-open="' + m.k + '"]') ? root.querySelector('[data-open="' + m.k + '"]').value : 0);
      var exp = AKS.r2((expected[m.k] || 0) + op);
      if (m.k === 'efectivo_usd') exp = AKS.r2(exp - changeUsd);
      $('aksQ-exp-' + m.k).textContent = fmt(m, exp);
      $('aksQ-exp-' + m.k).setAttribute('data-v', exp);
      var cntEl = root.querySelector('[data-cnt="' + m.k + '"]');
      var cell = $('aksQ-dif-' + m.k);
      if (cntEl.value === '') { cell.textContent = '-'; cell.removeAttribute('data-v'); return; }
      var d = AKS.r2(AKS.num(cntEl.value) - exp);
      cell.setAttribute('data-v', d);
      cell.innerHTML = '<span class="' + (Math.abs(d) < 0.005 ? 'aks-ok' : 'aks-bad') + '">' +
        (d > 0 ? '+' : '') + fmt(m, d) + (Math.abs(d) < 0.005 ? ' · cuadra' : (d > 0 ? ' · sobra' : ' · falta')) + '</span>';
    });
  }

  async function calc() {
    var date = $('aksQ-date').value;
    if (!date) { alert('Elige la fecha'); return; }
    abonosUsd = 0; expected = {}; nSales = 0; totalUsd = 0; changeUsd = 0; outflows = 0; outList = []; elec = [];
    try {
      var snap = await AKS.db().collection('sales').where('dateKey', '==', date).get();
      snap.forEach(function (d) {
        var s = d.data();
        if (s.status !== 'completed') return;
        nSales++; totalUsd += s.totalUsd; changeUsd += s.changeUsd || 0;
        (s.payments || []).forEach(function (p, k) {
          expected[p.method] = (expected[p.method] || 0) + p.amount;
          if (p.method.indexOf('efectivo') !== 0) {
            elec.push({ key: d.id + ':' + k, sale: s.saleNumber, method: p.method, currency: p.currency, amount: p.amount, ref: p.ref || '' });
          }
        });
        (s.refunds || []).forEach(function (r) { expected[r.method] = (expected[r.method] || 0) - r.amount; });
      });
      // Abonos de cuentas por cobrar recibidos ese día
      var ab = await AKS.db().collection('receivablePayments').where('dateKey', '==', date).get();
      ab.forEach(function (d) {
        var x = d.data();
        expected[x.method] = (expected[x.method] || 0) + x.amount; abonosUsd += x.creditUsd || x.amountUsd || 0;
        if (x.method.indexOf('efectivo') !== 0) {
          elec.push({ key: d.id, sale: 'Abono ' + (x.saleNumber || ''), method: x.method, currency: x.currency, amount: x.amount, ref: x.ref || '' });
        }
      });
      // Apertura(s) de caja del día
      openings = {};
      var op = await AKS.db().collection('cashOpenings').where('dateKey', '==', date).get();
      op.forEach(function (d) {
        var x = d.data();
        openings.efectivo_usd = (openings.efectivo_usd || 0) + (Number(x.efectivo_usd) || 0);
        openings.efectivo_bs = (openings.efectivo_bs || 0) + (Number(x.efectivo_bs) || 0);
      });
      // Salidas del día: gastos y compras pagadas, por método de pago
      var ex = await AKS.db().collection('expenses').where('paidDateKey', '==', date).get();
      ex.forEach(function (d) {
        var x = d.data();
        if (x.status !== 'paid' || !x.paidMethod) return;
        expected[x.paidMethod] = (expected[x.paidMethod] || 0) - x.paidAmount; outflows += x.amountUsd;
        outList.push((x.description || x.category) + ' (' + x.paidMethod + ')');
      });
      var pu = await AKS.db().collection('purchases').where('paidDateKey', '==', date).get();
      pu.forEach(function (d) {
        var x = d.data();
        if (x.status !== 'active' || x.paymentStatus !== 'paid' || !x.paymentMethod) return;
        expected[x.paymentMethod] = (expected[x.paymentMethod] || 0) - x.paidAmount; outflows += x.totalUsd;
        outList.push('Compra ' + x.invoiceNumber + ' ' + x.supplier + ' (' + x.paymentMethod + ')');
      });
      $('aksQ-elec').innerHTML = elec.length ? '<h4 style="margin:1rem 0 .4rem">Verificación de pagos electrónicos</h4>' +
        '<div class="aks-muted">Marca cada pago cuando lo veas en tu banco o en el punto de venta.</div>' +
        '<div class="aks-wrap"><table class="aks-table"><thead><tr><th>✓</th><th>Factura</th><th>Método</th><th>Monto</th><th>Referencia</th></tr></thead><tbody>' +
        elec.map(function (e, i) {
          return '<tr><td><input type="checkbox" data-ver="' + i + '"></td><td>' + AKS.esc(e.sale) + '</td><td>' + AKS.esc(e.method) +
            '</td><td>' + (e.currency === 'USD' ? AKS.usd(e.amount) : (e.currency === 'USDT' ? Number(e.amount).toFixed(2) + ' USDT' : AKS.bs(e.amount))) + '</td><td>' +
            (e.ref ? AKS.esc(e.ref) : '<span class="aks-bad">sin referencia</span>') + '</td></tr>';
        }).join('') + '</tbody></table></div><div id="aksQ-verSum" class="aks-muted"></div>' : '';
      verSum();
      $('aksQ-info').innerHTML = 'Facturas completadas: <strong>' + nSales + '</strong> · Total vendido: <strong>' +
        AKS.usd(totalUsd) + '</strong> · Vuelto entregado: ' + AKS.usd(changeUsd) +
        (abonosUsd ? ' · Abonos recibidos: <strong>' + AKS.usd(abonosUsd) + '</strong>' : '') +
        (outflows ? ' · Pagos de gastos/compras: <strong>' + AKS.usd(outflows) + '</strong> (' + AKS.esc(outList.join('; ')) + ')' : '');
      $('aksQ-body').innerHTML = METHODS.map(inputRow).join('');
      ['efectivo_usd', 'efectivo_bs'].forEach(function (k) {
        var oi = root.querySelector('[data-open="' + k + '"]');
        if (oi && openings[k]) oi.value = AKS.r2(openings[k]);
      });
      recalc();
    } catch (e) { alert('No se pudo calcular: ' + e.message); }
  }

  async function loadOpenings() {
    try {
      var snap = await AKS.db().collection('cashOpenings').where('dateKey', '==', AKS.dateKey()).get();
      var rows = [];
      snap.forEach(function (d) { rows.push(d.data()); });
      rows.sort(function (a, b) { return String(a.createdAt).localeCompare(String(b.createdAt)); });
      $('aksQ-olist').innerHTML = rows.length ? 'Aperturas de hoy: ' + rows.map(function (r) {
        return AKS.esc(AKS.fmtDateTime(r.createdAt)) + ' · ' + AKS.usd(r.efectivo_usd) + ' + ' + AKS.bs(r.efectivo_bs) + ' (' + AKS.esc(r.user) + ')';
      }).join(' | ') : '<span class="aks-bad">Todavía no registras la apertura de hoy.</span>';
    } catch (e) { $('aksQ-olist').textContent = ''; }
  }

  async function saveOpening() {
    var u = AKS.r2(AKS.num($('aksQ-ou').value)), b = AKS.r2(AKS.num($('aksQ-ob').value));
    if (u < 0 || b < 0) { alert('Los montos no pueden ser negativos'); return; }
    try {
      await AKS.db().collection('cashOpenings').add({ dateKey: AKS.dateKey(), efectivo_usd: u, efectivo_bs: b,
        user: AKS.userLabel(), createdAt: new Date().toISOString() });
      AKS.log('apertura_caja', 'Apertura: ' + AKS.usd(u) + ' y ' + AKS.bs(b), { usd: u, bs: b });
      alert('Apertura registrada');
      await loadOpenings();
    } catch (e) { alert('No se pudo guardar: ' + e.message); }
  }

  function verSum() {
    var s = $('aksQ-verSum'); if (!s) return;
    var n = root.querySelectorAll('[data-ver]:checked').length;
    s.innerHTML = 'Verificados: <strong>' + n + '</strong> de ' + elec.length +
      (n < elec.length ? ' · <span class="aks-bad">faltan ' + (elec.length - n) + ' por verificar</span>' : ' · <span class="aks-ok">todos verificados</span>');
  }

  async function save() {
    if (!$('aksQ-body').children.length) { alert('Primero pulsa "Calcular"'); return; }
    var date = $('aksQ-date').value;
    var counted = {}, exp = {}, diff = {}, open = {}, any = false;
    METHODS.forEach(function (m) {
      var c = root.querySelector('[data-cnt="' + m.k + '"]').value;
      exp[m.k] = AKS.num($('aksQ-exp-' + m.k).getAttribute('data-v'));
      var o = root.querySelector('[data-open="' + m.k + '"]');
      if (o) open[m.k] = AKS.num(o.value);
      if (c !== '') { any = true; counted[m.k] = AKS.num(c); diff[m.k] = AKS.r2(AKS.num(c) - exp[m.k]); }
    });
    if (!any) { alert('Escribe lo contado en al menos un método'); return; }
    var prev = await AKS.db().collection('cashCloses').where('dateKey', '==', date).get();
    if (!prev.empty && !confirm('Ya existe un cierre para esta fecha. ¿Guardar otro (por ejemplo, otro turno)?')) return;
    try {
      await AKS.db().collection('cashCloses').add({ dateKey: date, nSales: nSales, totalUsd: AKS.r2(totalUsd),
        changeUsd: AKS.r2(changeUsd), opening: open, expected: exp, counted: counted, diff: diff,
        notes: $('aksQ-notes').value.trim(), outflowsUsd: AKS.r2(outflows),
        electronic: elec.length, verified: root.querySelectorAll('[data-ver]:checked').length, user: AKS.userLabel(), createdAt: new Date().toISOString() });
      AKS.log('cierre_caja', 'Cierre del ' + date + ' (' + nSales + ' ventas)', { diff: diff });
      alert('Cierre guardado');
      $('aksQ-body').innerHTML = ''; $('aksQ-notes').value = '';
      await loadHist();
    } catch (e) { alert('No se pudo guardar: ' + e.message); }
  }

  async function loadHist() {
    var box = $('aksQ-hist');
    try {
      var snap = await AKS.db().collection('cashCloses').orderBy('createdAt', 'desc').limit(30).get();
      if (snap.empty) { box.innerHTML = 'Aún no hay cierres guardados.'; return; }
      var h = '<div class="aks-wrap"><table class="aks-table"><thead><tr><th>Fecha</th><th>Facturas</th><th>Vendido</th>' +
        '<th>Diferencias</th><th>Verificados</th><th>Responsable</th></tr></thead><tbody>';
      snap.forEach(function (d) {
        var c = d.data();
        var difs = METHODS.filter(function (m) { return c.diff && c.diff[m.k] !== undefined; }).map(function (m) {
          var v = c.diff[m.k];
          return '<span class="' + (Math.abs(v) < 0.005 ? 'aks-ok' : 'aks-bad') + '">' + m.label + ': ' +
            (v > 0 ? '+' : '') + fmt(m, v) + '</span>';
        }).join('<br>');
        h += '<tr><td>' + AKS.esc(AKS.fmtDate(c.dateKey)) + '</td><td>' + c.nSales + '</td><td>' + AKS.usd(c.totalUsd) +
          '</td><td>' + difs + (c.notes ? '<br><span class="aks-muted">' + AKS.esc(c.notes) + '</span>' : '') +
          '</td><td>' + (c.electronic ? c.verified + '/' + c.electronic : '-') + '</td><td>' + AKS.esc(c.user || '') + '</td></tr>';
      });
      box.innerHTML = h + '</tbody></table></div>';
    } catch (e) { box.innerHTML = '<span class="aks-bad">' + AKS.esc(e.message) + '</span>'; }
  }

  AKS.init(function () {
    root = AKS.addSection('cierres', html());
    if (!root) return;
    $('aksQ-load').addEventListener('click', calc);
    $('aksQ-save').addEventListener('click', save);
    $('aksQ-osave').addEventListener('click', saveOpening);
    root.addEventListener('input', function (ev) { if (ev.target.hasAttribute('data-cnt') || ev.target.hasAttribute('data-open')) recalc(); });
    root.addEventListener('change', function (ev) { if (ev.target.hasAttribute('data-ver')) verSum(); });
    AKS.addMenuItem('Apertura y cierre', 'cierres', function () {
      if (!$('aksQ-date').value) $('aksQ-date').value = AKS.dateKey();
      calc(); loadHist(); loadOpenings();
    }, 'caja');
  });
  AKS.cierre = { calc: calc, save: save };
})();
