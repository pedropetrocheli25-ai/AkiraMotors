// assets/js/admin/gastos.js
// Gastos del negocio y cuentas por pagar. Colección 'expenses'.
(function () {
  'use strict';
  var AKS = window.AKS;
  if (!AKS) { console.error('gastos.js: falta sistema-core.js'); return; }
  var CATS = ['Alquiler', 'Servicios (luz, agua, internet)', 'Sueldos', 'Transporte / flete', 'Impuestos y tasas',
    'Mantenimiento', 'Publicidad', 'Proveedor (deuda)', 'Otros'];
  var rows = [], root = null, pendingCache = [];
  var PM = [['efectivo_usd', 'Efectivo $', 'USD'], ['zelle', 'Zelle $', 'USD'], ['efectivo_bs', 'Efectivo Bs', 'VES'],
    ['pago_movil', 'Pago móvil Bs', 'VES'], ['punto', 'Punto de venta Bs', 'VES'], ['transferencia', 'Transferencia Bs', 'VES']];
  function pmOptions(attr) {
    return '<select ' + attr + '>' + PM.map(function (m) { return '<option value="' + m[0] + '">' + m[1] + '</option>'; }).join('') + '</select>';
  }
  async function payInfo(method, usd) {
    var cur = PM.filter(function (m) { return m[0] === method; })[0][2];
    return { cur: cur, amount: cur === 'USD' ? usd : AKS.r2(usd * await AKS.getRate()) };
  }
  function $(id) { return document.getElementById(id); }

  function html() {
    return '<h2 class="section-title">Gastos y cuentas por pagar</h2>' +
      '<div class="admin-card"><h3>Nuevo gasto</h3><div class="form-row-3">' +
      '<div class="form-group"><label>Fecha *</label><input type="date" id="aksG-date"></div>' +
      '<div class="form-group"><label>Categoría *</label><select id="aksG-cat">' +
      CATS.map(function (c) { return '<option>' + AKS.esc(c) + '</option>'; }).join('') + '</select></div>' +
      '<div class="form-group"><label>Monto en $ *</label><input type="number" step="0.01" min="0" id="aksG-amt"></div></div>' +
      '<div class="form-row-3"><div class="form-group"><label>Descripción / proveedor</label><input type="text" id="aksG-desc" maxlength="150"></div>' +
      '<div class="form-group"><label>Estado</label><select id="aksG-st"><option value="paid">Pagado</option>' +
      '<option value="pending">Pendiente (por pagar)</option></select></div>' +
      '<div class="form-group"><label>Vence (si está pendiente)</label><input type="date" id="aksG-due"></div></div>' +
      '<div class="form-group"><label>Método de pago (si ya está pagado)</label>' + pmOptions('id="aksG-pm"') + '</div>' +
      '<button class="btn btn-primary" id="aksG-save">Guardar gasto</button></div>' +
      '<div class="admin-card"><div class="aks-inline"><label class="aks-muted">Desde <input type="date" id="aksG-from"></label>' +
      '<label class="aks-muted">Hasta <input type="date" id="aksG-to"></label>' +
      '<button class="btn btn-secondary" id="aksG-go">Buscar</button></div><div id="aksG-out" class="aks-muted" style="margin-top:.8rem"></div></div>';
  }

  async function save() {
    var date = $('aksG-date').value, amt = AKS.r2(AKS.num($('aksG-amt').value));
    var st = $('aksG-st').value, due = $('aksG-due').value;
    if (!date) { alert('Elige la fecha'); return; }
    if (!(amt > 0)) { alert('Escribe un monto mayor a 0'); return; }
    try {
      var rec = { dateKey: date, category: $('aksG-cat').value,
        description: $('aksG-desc').value.trim(), amountUsd: amt, status: st, dueDate: st === 'pending' ? due : '',
        paidAt: st === 'paid' ? new Date().toISOString() : '', user: AKS.userLabel(), createdAt: new Date().toISOString() };
      if (st === 'paid') {
        var pi = await payInfo($('aksG-pm').value, amt);
        rec.paidMethod = $('aksG-pm').value; rec.paidAmount = pi.amount; rec.paidDateKey = date;
      }
      await AKS.db().collection('expenses').add(rec);
      $('aksG-amt').value = ''; $('aksG-desc').value = ''; $('aksG-due').value = '';
      await search();
    } catch (e) { alert('No se pudo guardar: ' + e.message); }
  }

  async function search() {
    var from = $('aksG-from').value, to = $('aksG-to').value;
    if (!from || !to || from > to) { alert('Rango de fechas inválido'); return; }
    try {
      var snap = await AKS.db().collection('expenses').where('dateKey', '>=', from).where('dateKey', '<=', to).get();
      rows = []; snap.forEach(function (d) { var x = d.data(); x._id = d.id; rows.push(x); });
      rows.sort(function (a, b) { return String(b.dateKey).localeCompare(String(a.dateKey)); });
      // Pendientes de cualquier fecha
      var pend = await AKS.db().collection('expenses').where('status', '==', 'pending').get();
      var pr = []; pend.forEach(function (d) { var x = d.data(); x._id = d.id; pr.push(x); });
      pendingCache = pr;
      render(pr);
    } catch (e) { $('aksG-out').innerHTML = '<span class="aks-bad">' + AKS.esc(e.message) + '</span>'; }
  }

  function render(pending) {
    var tot = 0, byCat = {};
    rows.forEach(function (x) { if (x.purchaseId) return; tot += x.amountUsd; byCat[x.category] = (byCat[x.category] || 0) + x.amountUsd; });
    var pt = 0; pending.forEach(function (x) { pt += x.amountUsd; });
    var h = '<div class="aks-kpis"><div class="aks-kpi"><div class="aks-muted">Gastos del rango</div><div style="font-size:1.5rem;font-weight:800">' + AKS.usd(tot) +
      '</div></div><div class="aks-kpi"><div class="aks-muted">Por pagar (total pendiente)</div><div style="font-size:1.5rem;font-weight:800">' + AKS.usd(pt) + '</div></div></div>';
    h += Object.keys(byCat).map(function (c) { return AKS.esc(c) + ': <strong>' + AKS.usd(byCat[c]) + '</strong>'; }).join(' · ');
    h += '<h3 style="margin:1rem 0 .4rem">Por pagar</h3>' + table(pending, true);
    h += '<h3 style="margin:1rem 0 .4rem">Gastos del rango</h3>' + table(rows, false);
    $('aksG-out').innerHTML = h;
  }

  function table(list, isPend) {
    if (!list.length) return '<div class="aks-muted">Nada por mostrar.</div>';
    var keep = list.slice();
    return '<div class="aks-wrap"><table class="aks-table"><thead><tr><th>Fecha</th><th>Categoría</th><th>Descripción</th><th>Monto</th><th>Estado</th><th></th></tr></thead><tbody>' +
      keep.map(function (x) {
        return '<tr><td>' + AKS.esc(AKS.fmtDate(x.dateKey)) + '</td><td>' + AKS.esc(x.category) + '</td><td>' + AKS.esc(x.description || '') +
          '</td><td>' + AKS.usd(x.amountUsd) + '</td><td>' + (x.status === 'paid' ? '<span class="aks-ok">Pagado</span>' :
          '<span class="aks-bad">Pendiente' + (x.dueDate ? ' · vence ' + AKS.esc(AKS.fmtDate(x.dueDate)) + (x.dueDate < AKS.dateKey() ? ' (VENCIDA)' : '') : '') + '</span>') + '</td><td>' +
          (x.status === 'pending' ? pmOptions('data-pm="' + AKS.esc(x._id) + '"') + ' <button class="btn btn-secondary btn-small" data-act="pay" data-id="' + AKS.esc(x._id) + '">Marcar pagado</button> ' : '') +
          '<button class="btn btn-danger btn-small" data-act="del" data-id="' + AKS.esc(x._id) + '">Eliminar</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  async function open() {
    if (!$('aksG-date').value) $('aksG-date').value = AKS.dateKey();
    if (!$('aksG-from').value) { $('aksG-from').value = AKS.dateKey().slice(0, 8) + '01'; $('aksG-to').value = AKS.dateKey(); }
    await search();
  }

  AKS.init(function () {
    root = AKS.addSection('gastos', html());
    if (!root) return;
    $('aksG-save').addEventListener('click', save);
    $('aksG-go').addEventListener('click', search);
    root.addEventListener('click', async function (ev) {
      var act = ev.target.getAttribute && ev.target.getAttribute('data-act');
      if (!act || (act !== 'pay' && act !== 'del')) return;
      var id = ev.target.getAttribute('data-id');
      try {
        if (act === 'pay') {
          var sel = root.querySelector('[data-pm="' + id + '"]'), m = sel ? sel.value : 'efectivo_usd';
          var ex = rows.concat(pendingCache).filter(function (z) { return z._id === id; })[0];
          var pi2 = await payInfo(m, ex.amountUsd);
          await AKS.db().collection('expenses').doc(id).update({ status: 'paid', paidAt: new Date().toISOString(),
            paidMethod: m, paidAmount: pi2.amount, paidDateKey: AKS.dateKey() });
        }
        else { if (!confirm('¿Eliminar este gasto?')) return; AKS.log('gasto_eliminado', 'Gasto ' + id); await AKS.db().collection('expenses').doc(id).delete(); }
        await search();
      } catch (e) { alert('Error: ' + e.message); }
    });
    AKS.addMenuItem('Gastos / por pagar', 'gastos', open, 'ventas');
  });
})();
