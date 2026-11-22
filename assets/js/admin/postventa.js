// assets/js/admin/postventa.js
// Recordatorios post-venta: clientes que compraron hace N días, con mensaje de WhatsApp.
(function () {
  'use strict';
  var AKS = window.AKS;
  if (!AKS) { console.error('postventa.js: falta sistema-core.js'); return; }
  function $(id) { return document.getElementById(id); }
  var DEFAULT = 'Hola {nombre}, te escribimos de Akira Motors. ¿Cómo te fue con tu compra ({producto})? Si necesitas algo más para tu vehículo, estamos para ayudarte.';

  function html() {
    return '<h2 class="section-title">Seguimiento a clientes</h2>' +
      '<div class="admin-card"><div class="alert-info">Escribe a quien compró hace unos días para saber cómo le fue y ofrecerle lo que sigue (aceite, filtros, pastillas). Cada cliente tiene un botón que abre WhatsApp con el mensaje listo; tú decides si lo envías.</div>' +
      '<div class="aks-inline"><label class="aks-muted">Compraron hace entre <input type="number" id="aksS-a" value="7" min="1" style="width:70px"> y <input type="number" id="aksS-b" value="30" min="1" style="width:70px"> días</label>' +
      '<button class="btn btn-primary" id="aksS-go">Buscar</button></div>' +
      '<label class="aks-muted" style="display:block;margin-top:.5rem">Mensaje (usa {nombre} y {producto})</label>' +
      '<textarea id="aksS-msg" rows="3" style="width:100%;box-sizing:border-box;font-size:16px"></textarea></div><div id="aksS-out"></div>';
  }

  function msgFor(c) {
    var name = String(c.name || '').split(' ')[0] || 'cliente';
    return $('aksS-msg').value.replace(/\{nombre\}/g, name).replace(/\{producto\}/g, c.item || 'tu compra');
  }
  function phoneVE(p) { var d = String(p || '').replace(/\D/g, ''); if (/^0\d{10}$/.test(d)) return '58' + d.slice(1); return /^58\d{10}$/.test(d) ? d : ''; }

  var found = [];
  async function run() {
    var a = parseInt($('aksS-a').value, 10) || 7, b = parseInt($('aksS-b').value, 10) || 30, out = $('aksS-out');
    if (a > b) { var t = a; a = b; b = t; }
    out.innerHTML = '<div class="aks-muted">Buscando...</div>';
    try {
      var d1 = AKS.dateKey(new Date(Date.now() - b * 86400000)), d2 = AKS.dateKey(new Date(Date.now() - a * 86400000));
      var from = AKS.dateKey(new Date(Date.now() - 365 * 86400000)), last = {};
      var ss = await AKS.db().collection('sales').where('dateKey', '>=', from).get();
      ss.forEach(function (d) {
        var s = d.data(); if (s.status !== 'completed') return;
        var key = s.clientId || s.customerDoc || s.customerPhone; if (!key) return;
        if (!last[key] || s.dateKey > last[key].dateKey) last[key] = { dateKey: s.dateKey, name: s.customerName, phone: s.customerPhone, item: (s.items && s.items[0] && s.items[0].name) || '', num: s.saleNumber };
      });
      found = Object.keys(last).map(function (k) { return last[k]; }).filter(function (c) { return c.dateKey >= d1 && c.dateKey <= d2 && phoneVE(c.phone); })
        .sort(function (x, y) { return y.dateKey < x.dateKey ? -1 : 1; });
      out.innerHTML = '<div class="admin-card"><div class="aks-muted">' + found.length + ' clientes con teléfono. Su última compra cae en ese rango (si volvieron a comprar después, ya no aparecen).</div>' +
        (found.length ? '<table class="admin-table"><thead><tr><th>Cliente</th><th>Última compra</th><th>Producto</th><th></th></tr></thead><tbody>' +
          found.map(function (c, i) { return '<tr><td>' + AKS.esc(c.name || '-') + '<br><small>' + AKS.esc(c.phone) + '</small></td><td>' + AKS.esc(AKS.fmtDate(c.dateKey)) + '<br><small>' + AKS.esc(c.num || '') + '</small></td><td>' + AKS.esc(c.item) + '</td><td><button class="btn btn-secondary" data-i="' + i + '">WhatsApp</button></td></tr>'; }).join('') + '</tbody></table>' : '') + '</div>';
      out.querySelectorAll('button[data-i]').forEach(function (bt) {
        bt.addEventListener('click', function () {
          var c = found[parseInt(bt.getAttribute('data-i'), 10)];
          window.open('https://wa.me/' + phoneVE(c.phone) + '?text=' + encodeURIComponent(msgFor(c)), '_blank', 'noopener');
          AKS.log('seguimiento_cliente', 'Recordatorio post-venta a ' + (c.name || c.phone), { sale: c.num });
        });
      });
    } catch (e) { out.innerHTML = '<div class="aks-bad">' + AKS.esc(e.message) + '</div>'; }
  }

  AKS.init(function () {
    if (!AKS.addSection('postventa', html())) return;
    try { $('aksS-msg').value = localStorage.getItem('aks_postventa_msg') || DEFAULT; } catch (e) { $('aksS-msg').value = DEFAULT; }
    $('aksS-msg').addEventListener('change', function () { try { localStorage.setItem('aks_postventa_msg', this.value); } catch (e) { /* ignorar */ } });
    $('aksS-go').addEventListener('click', run);
    AKS.addMenuItem('Seguimiento a clientes', 'postventa', run, 'clientes');
  });
})();
