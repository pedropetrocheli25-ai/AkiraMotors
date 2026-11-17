// assets/js/admin/conteo.js
// Conteo físico de inventario: escribes lo que cuentas y se ajusta el stock.
// Cada ajuste queda en el kárdex (stockMovements, tipo 'ajuste_conteo').
(function () {
  'use strict';
  var AKS = window.AKS;
  if (!AKS) { console.error('conteo.js: falta sistema-core.js'); return; }
  var root = null;
  function $(id) { return document.getElementById(id); }

  function html() {
    return '<h2 class="section-title">Conteo físico de inventario</h2>' +
      '<div class="admin-card"><div class="alert-info">Escribe la cantidad que contaste. Deja vacío lo que no contaste. ' +
      'Al aplicar, el stock se corrige y queda registrado quién y cuándo.</div>' +
      '<div class="aks-inline"><input type="text" id="aksN-q" class="aks-search" placeholder="Filtrar por código, nombre o marca..." style="min-width:260px">' +
      '<label class="aks-muted"><input type="checkbox" id="aksN-onlydiff"> Solo con diferencia</label>' +
      '<button class="btn btn-primary" id="aksN-apply">Aplicar ajustes</button></div>' +
      '<div id="aksN-list" class="aks-muted" style="margin-top:.8rem">Cargando...</div></div>';
  }

  function render() {
    var q = AKS.norm($('aksN-q').value), only = $('aksN-onlydiff').checked;
    var keep = {};
    root.querySelectorAll('[data-cnt]').forEach(function (i) { if (i.value !== '') keep[i.getAttribute('data-cnt')] = i.value; });
    root.__keep = Object.assign(root.__keep || {}, keep);
    var rows = AKS.products.filter(function (p) {
      var v = root.__keep[p.id];
      if (only && !(v !== undefined && v !== '' && Number(v) !== p.stock)) return false;
      return !q || AKS.norm([p.code, p.name, p.brand, p.partNumber].join(' ')).indexOf(q) !== -1;
    }).slice(0, 300);
    if (!rows.length) { $('aksN-list').innerHTML = 'Sin productos.'; return; }
    $('aksN-list').innerHTML = '<div class="aks-wrap"><table class="aks-table"><thead><tr><th>Código</th><th>Producto</th>' +
      '<th>Stock en sistema</th><th>Contado</th><th>Diferencia</th></tr></thead><tbody>' + rows.map(function (p) {
        var v = root.__keep[p.id];
        var d = (v !== undefined && v !== '') ? Number(v) - p.stock : null;
        return '<tr><td>' + AKS.esc(p.code) + '</td><td>' + AKS.esc(p.name) + '</td><td>' + p.stock +
          '</td><td><input type="number" min="0" step="1" style="width:90px" data-cnt="' + AKS.esc(p.id) + '" value="' +
          (v === undefined ? '' : AKS.esc(v)) + '"></td><td data-dif="' + AKS.esc(p.id) + '">' + difHtml(d) + '</td></tr>';
      }).join('') + '</tbody></table></div>' + (AKS.products.length > 300 ? '<div class="aks-muted">Mostrando 300; usa el filtro.</div>' : '');
  }
  function difHtml(d) {
    if (d === null) return '';
    return '<span class="' + (d === 0 ? 'aks-ok' : 'aks-bad') + '">' + (d > 0 ? '+' : '') + d + '</span>';
  }

  async function apply() {
    var keep = root.__keep || {}, todo = [];
    AKS.products.forEach(function (p) {
      var v = keep[p.id];
      if (v === undefined || v === '') return;
      var n = Math.floor(Number(v));
      if (!isFinite(n) || n < 0) return;
      if (n !== p.stock) todo.push({ p: p, n: n });
    });
    if (!todo.length) { alert('No hay diferencias que ajustar'); return; }
    if (!confirm('Se ajustará el stock de ' + todo.length + ' producto(s). ¿Continuar?')) return;
    var db = AKS.db(), ok = 0, fail = 0;
    $('aksN-apply').disabled = true;
    for (var i = 0; i < todo.length; i++) {
      try {
        await db.runTransaction(async function (tx) {
          var ref = db.collection('products').doc(todo[i].p.id);
          var s = await tx.get(ref);
          if (!s.exists) throw new Error('no existe');
          var before = Number(s.data().stock) || 0, after = todo[i].n;
          tx.update(ref, { stock: after, updatedAt: new Date().toISOString() });
          AKS.movement(tx, { productId: todo[i].p.id, code: todo[i].p.code, name: todo[i].p.name,
            type: 'ajuste_conteo', qty: after - before, stockBefore: before, stockAfter: after,
            refType: 'conteo', refId: '' });
        });
        ok++;
      } catch (e) { console.error(e); fail++; }
    }
    $('aksN-apply').disabled = false;
    root.__keep = {};
    await AKS.loadProducts(true);
    render();
    alert('Ajustados: ' + ok + (fail ? ' · con error: ' + fail : ''));
  }

  async function open() {
    try { await AKS.loadProducts(true); render(); }
    catch (e) { $('aksN-list').innerHTML = '<span class="aks-bad">' + AKS.esc(e.message) + '</span>'; }
  }

  AKS.init(function () {
    root = AKS.addSection('conteo', html());
    if (!root) return;
    root.__keep = {};
    $('aksN-q').addEventListener('input', render);
    $('aksN-onlydiff').addEventListener('change', render);
    $('aksN-apply').addEventListener('click', apply);
    root.addEventListener('input', function (ev) {
      var id = ev.target.getAttribute && ev.target.getAttribute('data-cnt');
      if (!id) return;
      root.__keep[id] = ev.target.value;
      var p = AKS.products.filter(function (x) { return x.id === id; })[0];
      $('aksN-list').querySelector('[data-dif="' + id + '"]').innerHTML =
        ev.target.value === '' ? '' : difHtml(Math.floor(Number(ev.target.value)) - p.stock);
    });
    AKS.addMenuItem('Conteo físico', 'conteo', open, 'inventario');
  });
})();
