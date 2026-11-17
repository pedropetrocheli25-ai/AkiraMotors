// assets/js/admin/etiquetas.js
// Etiquetas con código de barras (Code 128) para imprimir y pegar en los repuestos.
// El código que se imprime es el "código" del producto: la Caja lo busca con el lector.
(function () {
  'use strict';
  var AKS = window.AKS;
  if (!AKS) { console.error('etiquetas.js: falta sistema-core.js'); return; }

  var P = ('212222,222122,222221,121223,121322,131222,122213,122312,132212,221213,221312,231212,112232,122132,' +
    '122231,113222,123122,123221,223211,221132,221231,213212,223112,312131,311222,321122,321221,312212,322112,' +
    '322211,212123,212321,232121,111323,131123,131321,112313,132113,132311,211313,231113,231311,112133,112331,' +
    '132131,113123,113321,133121,313121,211331,231131,213113,213311,213131,311123,311321,331121,312113,312311,' +
    '332111,314111,221411,431111,111224,111422,121124,121421,141122,141221,112214,112412,122114,122411,142112,' +
    '142211,241211,221114,413111,241112,134111,111242,121142,121241,114212,124112,124211,411212,421112,421211,' +
    '212141,214121,412121,111143,111341,131141,114113,114311,411113,411311,113141,114131,311141,411131,211412,' +
    '211214,211232,2331112').split(',');

  // Devuelve [{x, w}] de las barras negras en unidades de módulo, y el ancho total
  function code128(text) {
    var vals = [104], sum = 104, i, v;
    for (i = 0; i < text.length; i++) {
      v = text.charCodeAt(i) - 32;
      if (v < 0 || v > 94) v = '?'.charCodeAt(0) - 32; // fuera de ASCII imprimible
      vals.push(v); sum += v * (i + 1);
    }
    vals.push(sum % 103); vals.push(106);
    var bars = [], x = 0;
    vals.forEach(function (c) {
      var pat = P[c];
      for (var k = 0; k < pat.length; k++) {
        var w = +pat[k];
        if (k % 2 === 0) bars.push({ x: x, w: w });
        x += w;
      }
    });
    return { bars: bars, width: x };
  }

  function svg(text, hpx) {
    var c = code128(text), quiet = 10, W = c.width + quiet * 2;
    var rects = c.bars.map(function (b) {
      return '<rect x="' + (b.x + quiet) + '" y="0" width="' + b.w + '" height="' + hpx + '"/>';
    }).join('');
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + hpx +
      '" preserveAspectRatio="none" shape-rendering="crispEdges"><rect width="' + W + '" height="' + hpx +
      '" fill="#fff"/><g fill="#000">' + rects + '</g></svg>';
  }

  var list = [], root = null;
  function $(id) { return document.getElementById(id); }

  function html() {
    return '<h2 class="section-title">Etiquetas de código de barras</h2>' +
      '<div class="admin-card"><div class="alert-info">Busca los productos, indica cuántas etiquetas quieres de cada uno e imprime. ' +
      'La etiqueta lleva el nombre, el precio en $ y el código de barras del producto: en la Caja usa el modo "Código" con el lector.</div>' +
      '<input type="text" id="aksE-q" class="aks-search" placeholder="Buscar producto por código o nombre...">' +
      '<div id="aksE-res" class="aks-results"></div>' +
      '<div id="aksE-list" style="margin-top:.8rem"></div>' +
      '<div class="aks-inline" style="margin-top:.6rem"><label class="aks-muted">Tamaño ' +
      '<select id="aksE-size"><option value="50x30">50 x 30 mm</option><option value="38x25">38 x 25 mm</option>' +
      '<option value="70x40">70 x 40 mm</option></select></label>' +
      '<button class="btn btn-primary" id="aksE-print">Imprimir etiquetas</button></div></div>';
  }

  function renderList() {
    if (!list.length) { $('aksE-list').innerHTML = '<span class="aks-muted">Aún no has agregado productos.</span>'; return; }
    $('aksE-list').innerHTML = '<div class="aks-wrap"><table class="aks-table"><thead><tr><th>Código</th><th>Producto</th>' +
      '<th>Precio</th><th>Etiquetas</th><th></th></tr></thead><tbody>' + list.map(function (x, i) {
        return '<tr><td>' + AKS.esc(x.p.code) + '</td><td>' + AKS.esc(x.p.name) + '</td><td>' + AKS.usd(AKS.effectivePrice(x.p)) +
          '</td><td><input type="number" min="1" max="200" value="' + x.n + '" data-i="' + i + '" style="width:70px"></td>' +
          '<td><button class="btn btn-danger btn-small" data-rm="' + i + '">Quitar</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function print() {
    if (!list.length) { alert('Agrega productos primero'); return; }
    var sz = $('aksE-size').value.split('x'), w = +sz[0], h = +sz[1];
    var labels = '';
    list.forEach(function (x) {
      if (!x.p.code) return;
      var one = '<div class="l"><div class="n">' + AKS.esc(x.p.name.slice(0, 40)) + '</div>' + svg(x.p.code, 40) +
        '<div class="c">' + AKS.esc(x.p.code) + '</div><div class="p">' + AKS.usd(AKS.effectivePrice(x.p)) + '</div></div>';
      for (var k = 0; k < x.n; k++) labels += one;
    });
    var win = window.open('', '_blank');
    if (!win) { alert('Permite las ventanas emergentes para imprimir'); return; }
    win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas</title><style>' +
      '@page{margin:4mm}body{margin:0;font-family:Arial,sans-serif;display:flex;flex-wrap:wrap;gap:2mm}' +
      '.l{width:' + w + 'mm;height:' + h + 'mm;box-sizing:border-box;border:.2mm dashed #bbb;padding:1mm;overflow:hidden;' +
      'page-break-inside:avoid;display:flex;flex-direction:column;text-align:center}' +
      '.n{font-size:' + (h >= 30 ? 8 : 6.5) + 'pt;line-height:1.1;height:2.3em;overflow:hidden;font-weight:bold}' +
      'svg{width:100%;flex:1;min-height:0}.c{font-size:7pt;font-family:monospace}.p{font-size:' + (h >= 30 ? 11 : 9) +
      'pt;font-weight:bold}</style></head><body>' + labels + '<script>window.onload=function(){window.print()}<\/script></body></html>');
    win.document.close();
  }

  AKS.init(function () {
    root = AKS.addSection('etiquetas', html());
    if (!root) return;
    renderList();
    $('aksE-q').addEventListener('input', function () {
      var r = AKS.searchProducts($('aksE-q').value, 8);
      $('aksE-res').innerHTML = r.map(function (p) {
        return '<div class="aks-result" data-add="' + AKS.esc(p.id) + '"><strong>' + AKS.esc(p.name) + '</strong> <span class="aks-muted">' +
          AKS.esc(p.code) + ' · ' + AKS.usd(AKS.effectivePrice(p)) + '</span></div>';
      }).join('');
    });
    root.addEventListener('click', function (ev) {
      var add = ev.target.closest && ev.target.closest('[data-add]');
      if (add) {
        var p = AKS.products.filter(function (x) { return x.id === add.getAttribute('data-add'); })[0];
        if (p && !list.some(function (x) { return x.p.id === p.id; })) list.push({ p: p, n: 1 });
        $('aksE-res').innerHTML = ''; $('aksE-q').value = ''; renderList(); return;
      }
      var rm = ev.target.getAttribute && ev.target.getAttribute('data-rm');
      if (rm !== null && rm !== undefined && rm !== '') { list.splice(+rm, 1); renderList(); }
    });
    root.addEventListener('input', function (ev) {
      var i = ev.target.getAttribute && ev.target.getAttribute('data-i');
      if (i !== null && i !== undefined) list[+i].n = Math.max(1, Math.min(200, Math.floor(+ev.target.value) || 1));
    });
    $('aksE-print').addEventListener('click', print);
    AKS.addMenuItem('Etiquetas', 'etiquetas', function () { AKS.loadProducts(false).catch(function () {}); }, 'inventario');
  });
  AKS.etiquetas = { code128: code128, svg: svg };
})();
