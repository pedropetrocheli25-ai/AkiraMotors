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
    { k: 'transferencia', label: 'Transferencia Bs', cur: 'VES' }
  ];
  var root = null, expected = {}, nSales = 0, totalUsd = 0, changeUsd = 0;
  function $(id) { return document.getElementById(id); }
  function fmt(m, v) { return m.cur === 'USD' ? AKS.usd(v) : AKS.bs(v); }

  function html() {
    return '<h2 class="section-title">Cierre de caja</h2>' +
      '<div class="admin-card"><div class="aks-inline"><label class="aks-muted">Fecha ' +
      '<input type="date" id="aksQ-date"></label><button class="btn btn-secondary" id="aksQ-load">Calcular</button></div>' +
      '<div id="aksQ-info" class="aks-muted" style="margin:.6rem 0"></div>' +
      '<div class="aks-wrap"><table class="aks-table"><thead><tr><th>Método</th><th>Fondo inicial</th>' +
      '<th>Esperado según facturas</th><th>Contado</th><th>Diferencia</th></tr></thead><tbody id="aksQ-body"></tbody></table></div>' +
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
    expected = {}; nSales = 0; totalUsd = 0; changeUsd = 0;
    try {
      var snap = await AKS.db().collection('sales').where('dateKey', '==', date).get();
      snap.forEach(function (d) {
        var s = d.data();
        if (s.status !== 'completed') return;
        nSales++; totalUsd += s.totalUsd; changeUsd += s.changeUsd || 0;
        (s.payments || []).forEach(function (p) { expected[p.method] = (expected[p.method] || 0) + p.amount; });
      });
      $('aksQ-info').innerHTML = 'Facturas completadas: <strong>' + nSales + '</strong> · Total vendido: <strong>' +
        AKS.usd(totalUsd) + '</strong> · Vuelto entregado: ' + AKS.usd(changeUsd);
      $('aksQ-body').innerHTML = METHODS.map(inputRow).join('');
      recalc();
    } catch (e) { alert('No se pudo calcular: ' + e.message); }
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
        notes: $('aksQ-notes').value.trim(), user: AKS.userLabel(), createdAt: new Date().toISOString() });
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
        '<th>Diferencias</th><th>Responsable</th></tr></thead><tbody>';
      snap.forEach(function (d) {
        var c = d.data();
        var difs = METHODS.filter(function (m) { return c.diff && c.diff[m.k] !== undefined; }).map(function (m) {
          var v = c.diff[m.k];
          return '<span class="' + (Math.abs(v) < 0.005 ? 'aks-ok' : 'aks-bad') + '">' + m.label + ': ' +
            (v > 0 ? '+' : '') + fmt(m, v) + '</span>';
        }).join('<br>');
        h += '<tr><td>' + AKS.esc(AKS.fmtDate(c.dateKey)) + '</td><td>' + c.nSales + '</td><td>' + AKS.usd(c.totalUsd) +
          '</td><td>' + difs + (c.notes ? '<br><span class="aks-muted">' + AKS.esc(c.notes) + '</span>' : '') +
          '</td><td>' + AKS.esc(c.user || '') + '</td></tr>';
      });
      box.innerHTML = h + '</tbody></table></div>';
    } catch (e) { box.innerHTML = '<span class="aks-bad">' + AKS.esc(e.message) + '</span>'; }
  }

  AKS.init(function () {
    root = AKS.addSection('cierres', html());
    if (!root) return;
    $('aksQ-load').addEventListener('click', calc);
    $('aksQ-save').addEventListener('click', save);
    root.addEventListener('input', function (ev) { if (ev.target.hasAttribute('data-cnt') || ev.target.hasAttribute('data-open')) recalc(); });
    AKS.addMenuItem('Cierre de caja', 'cierres', function () {
      if (!$('aksQ-date').value) $('aksQ-date').value = AKS.dateKey();
      calc(); loadHist();
    }, 'caja');
  });
  AKS.cierre = { calc: calc, save: save };
})();
