// assets/js/admin/respaldo.js
// Respaldo: descarga un archivo con todos los datos del negocio.
// Requiere sistema-core.js. Va en Ajustes.
(function () {
  'use strict';
  var AKS = window.AKS;
  if (!AKS) { console.error('respaldo.js: falta sistema-core.js'); return; }

  var COLLECTIONS = [
    ['products', 'Productos'], ['productCosts', 'Costos'], ['clients', 'Clientes'],
    ['sales', 'Facturas (ventas)'], ['purchases', 'Compras a proveedores'],
    ['costHistory', 'Historial de costos'], ['stockMovements', 'Movimientos de stock'],
    ['bcvHistory', 'Historial de tasa'], ['cashCloses', 'Cierres de caja'],
    ['settings', 'Ajustes'], ['brands', 'Marcas'], ['carouselSlides', 'Carrusel'],
    ['orders', 'Pedidos web (antiguos)']
  ];
  function $(id) { return document.getElementById(id); }

  async function run() {
    var btn = $('aksR-go'), st = $('aksR-st');
    var withImg = $('aksR-img').checked;
    btn.disabled = true;
    var out = { app: 'AkiraMotors', createdAt: new Date().toISOString(), collections: {} };
    var errors = [];
    try {
      for (var i = 0; i < COLLECTIONS.length; i++) {
        var name = COLLECTIONS[i][0];
        st.textContent = 'Leyendo ' + COLLECTIONS[i][1] + '...';
        try {
          var snap = await AKS.db().collection(name).get();
          var arr = [];
          snap.forEach(function (d) {
            var x = d.data();
            if (!withImg) { delete x.thumbnail; delete x.images; delete x.image; }
            arr.push({ id: d.id, data: x });
          });
          out.collections[name] = arr;
        } catch (e) { errors.push(name + ': ' + e.message); }
      }
      var blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'Respaldo_AkiraMotors_' + AKS.dateKey() + '.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      st.textContent = 'Respaldo descargado (' + Math.round(blob.size / 1024) + ' KB).' +
        (errors.length ? ' Con avisos: ' + errors.join(' | ') : '');
      try { localStorage.setItem('aks_last_backup', new Date().toISOString()); } catch (e) { /* ignorar */ }
      lastLabel();
    } catch (e) {
      console.error(e);
      st.textContent = 'No se pudo generar el respaldo: ' + e.message;
    } finally { btn.disabled = false; }
  }

  function lastLabel() {
    var v = '';
    try { v = localStorage.getItem('aks_last_backup') || ''; } catch (e) { /* ignorar */ }
    $('aksR-last').textContent = v ? 'Último respaldo en este equipo: ' + AKS.fmtDateTime(v)
      : 'Todavía no has descargado ningún respaldo en este equipo.';
  }

  AKS.init(function () {
    var sec = $('section-settings');
    if (!sec) return;
    var card = document.createElement('div');
    card.className = 'admin-card';
    card.innerHTML = '<h3>Respaldo de datos</h3><div class="alert-info">Descarga una copia de todo: ' +
      'productos, costos, clientes, facturas, compras y ajustes. Guárdala en tu computadora y en la nube ' +
      '(Google Drive). Hazlo al menos una vez por semana.</div>' +
      '<label class="aks-muted"><input type="checkbox" id="aksR-img"> Incluir imágenes (el archivo pesa mucho más)</label>' +
      '<div class="aks-inline" style="margin-top:.6rem"><button class="btn btn-primary" id="aksR-go">Descargar respaldo</button></div>' +
      '<div class="aks-muted" id="aksR-st" style="margin-top:.5rem"></div><div class="aks-muted" id="aksR-last"></div>';
    var h = sec.querySelector('h2');
    if (h && h.nextSibling) sec.insertBefore(card, h.nextSibling); else sec.appendChild(card);
    $('aksR-go').addEventListener('click', run);
    lastLabel();
  });
  AKS.respaldo = { run: run };
})();
