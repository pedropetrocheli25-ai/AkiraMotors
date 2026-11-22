// assets/js/admin/conciliacion.js
// Conciliación bancaria: cruza los pagos electrónicos registrados en el sistema con el extracto del banco (CSV).
(function () {
  'use strict';
  var AKS = window.AKS;
  if (!AKS) { console.error('conciliacion.js: falta sistema-core.js'); return; }
  function $(id) { return document.getElementById(id); }

  var table = [];      // filas del extracto (arreglo de arreglos)
  var result = null;

  function html() {
    return '<h2 class="section-title">Conciliar con el banco</h2>' +
      '<div class="admin-card"><div class="alert-info">Descarga el estado de cuenta de tu banco en CSV o Excel guardado como CSV (o copia y pega las filas). El sistema cruza cada pago móvil y transferencia con el banco por <strong>referencia y monto</strong>, y te avisa lo que no aparece y las referencias repetidas.</div>' +
      '<div class="aks-inline"><label class="aks-muted">Desde <input type="date" id="aksB-d1"></label><label class="aks-muted">Hasta <input type="date" id="aksB-d2"></label>' +
      '<input type="file" id="aksB-file" accept=".csv,.txt,text/csv,text/plain"></div>' +
      '<textarea id="aksB-text" rows="4" placeholder="...o pega aquí las filas del extracto" style="width:100%;box-sizing:border-box;margin-top:.5rem;font-size:16px"></textarea>' +
      '<div class="aks-inline" style="margin-top:.5rem"><label class="aks-muted">Columna de referencia <select id="aksB-cref"></select></label>' +
      '<label class="aks-muted">Columna de monto <select id="aksB-camt"></select></label>' +
      '<label class="aks-muted"><input type="checkbox" id="aksB-hdr" checked> La primera fila son títulos</label></div>' +
      '<div class="aks-inline" style="margin-top:.6rem"><button class="btn btn-primary" id="aksB-go">Conciliar</button>' +
      '<button class="btn btn-secondary" id="aksB-csv" style="display:none">Descargar resultado</button></div></div>' +
      '<div id="aksB-out"></div>';
  }

  function splitLine(line, sep) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (ch === sep && !q) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map(function (x) { return x.trim(); });
  }

  function parseText(text) {
    var lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (!lines.length) return [];
    var first = lines[0], sep = ';';
    var counts = { ';': (first.match(/;/g) || []).length, '\t': (first.match(/\t/g) || []).length, ',': (first.match(/,/g) || []).length };
    sep = counts[';'] >= counts['\t'] && counts[';'] >= counts[','] ? ';' : (counts['\t'] >= counts[','] ? '\t' : ',');
    if (!counts[sep]) sep = /\s{2,}/.test(first) ? '  ' : ';';
    return lines.map(function (l) { return sep === '  ' ? l.trim().split(/\s{2,}/) : splitLine(l, sep); });
  }

  // "1.234,56" -> 1234.56 ; "1,234.56" -> 1234.56 ; "-45,00" -> -45
  function parseAmount(s) {
    s = String(s || '').replace(/[^\d.,\-]/g, '');
    if (!s) return NaN;
    var neg = s.indexOf('-') !== -1; s = s.replace(/-/g, '');
    var lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
    if (lc > -1 && ld > -1) { if (lc > ld) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, ''); }
    else if (lc > -1) { if (/^\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, ''); else s = s.replace(',', '.'); }
    else if (ld > -1) { if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); }
    var v = parseFloat(s);
    return isNaN(v) ? NaN : (neg ? -v : v);
  }

  function fillColumns() {
    var hdr = $('aksB-hdr').checked, head = table[0] || [];
    var opts = head.map(function (h, i) { return '<option value="' + i + '">' + AKS.esc((hdr ? h : 'Columna ' + (i + 1)) || ('Columna ' + (i + 1))) + '</option>'; }).join('');
    $('aksB-cref').innerHTML = opts; $('aksB-camt').innerHTML = opts;
    var gr = -1, ga = -1;
    head.forEach(function (h, i) {
      var n = AKS.norm(h);
      if (gr < 0 && /ref|nro|numero|comprobante|operacion|documento/.test(n)) gr = i;
      if (ga < 0 && /monto|importe|abono|credito|haber|valor/.test(n)) ga = i;
    });
    if (gr >= 0) $('aksB-cref').value = gr; if (ga >= 0) $('aksB-camt').value = ga;
  }

  function ingest(text) {
    table = parseText(text);
    if (table.length) fillColumns();
  }

  function digits(s) { return String(s || '').replace(/\D/g, ''); }

  async function run() {
    var d1 = $('aksB-d1').value, d2 = $('aksB-d2').value;
    if (!d1 || !d2) { alert('Elige el rango de fechas'); return; }
    if (!table.length) ingest($('aksB-text').value);
    if (!table.length) { alert('Carga el archivo del banco o pega las filas'); return; }
    var ci = parseInt($('aksB-cref').value, 10), ca = parseInt($('aksB-camt').value, 10);
    var bank = [];
    table.slice($('aksB-hdr').checked ? 1 : 0).forEach(function (r, i) {
      var amt = parseAmount(r[ca]);
      if (!isNaN(amt)) bank.push({ i: i, ref: digits(r[ci]), refRaw: r[ci] || '', amt: Math.abs(amt), used: 0, row: r });
    });
    if (!bank.length) { alert('No pude leer montos en la columna elegida. Revisa las columnas.'); return; }
    var out = $('aksB-out'); out.innerHTML = '<div class="aks-muted">Conciliando...</div>';
    try {
      var pays = [];
      var ss = await AKS.db().collection('sales').where('dateKey', '>=', d1).where('dateKey', '<=', d2).get();
      ss.forEach(function (d) {
        var s = d.data(); if (s.status !== 'completed') return;
        (s.payments || []).forEach(function (p) {
          if (p.currency === 'VES' && (p.method === 'pago_movil' || p.method === 'transferencia')) {
            pays.push({ doc: s.saleNumber, date: s.dateKey, method: p.method, amount: p.amount, ref: String(p.ref || ''), refD: digits(p.ref) });
          }
        });
      });
      var ap = await AKS.db().collection('receivablePayments').where('dateKey', '>=', d1).where('dateKey', '<=', d2).get();
      ap.forEach(function (d) {
        var p = d.data();
        if (p.currency === 'VES' && (p.method === 'pago_movil' || p.method === 'transferencia')) {
          pays.push({ doc: 'Abono ' + (p.saleNumber || ''), date: p.dateKey, method: p.method, amount: p.amount, ref: String(p.ref || ''), refD: digits(p.ref) });
        }
      });
      var seen = {}, dupe = {};
      pays.forEach(function (p) { if (p.refD) { var k = p.method + ':' + p.refD; if (seen[k]) dupe[k] = true; seen[k] = true; } });
      var ok = [], missing = [];
      pays.forEach(function (p) {
        var tol = Math.max(0.05, p.amount * 0.005), hit = null;
        bank.forEach(function (b) {
          if (hit) return;
          var okAmt = Math.abs(b.amt - p.amount) <= tol;
          var okRef = p.refD.length >= 4 && b.ref && (b.ref.slice(-p.refD.length) === p.refD || p.refD.slice(-b.ref.length) === b.ref);
          if (okAmt && okRef) hit = b;
        });
        if (!hit && !p.refD) {
          var cands = bank.filter(function (b) { return !b.used && Math.abs(b.amt - p.amount) <= Math.max(0.05, p.amount * 0.005); });
          if (cands.length === 1) { hit = cands[0]; p.weak = true; }
        }
        if (hit) { hit.used++; p.bank = hit; ok.push(p); } else missing.push(p);
      });
      var extra = bank.filter(function (b) { return !b.used; });
      var dupPays = pays.filter(function (p) { return p.refD && dupe[p.method + ':' + p.refD]; });
      var bankDup = bank.filter(function (b) { return b.used > 1; });
      result = { ok: ok, missing: missing, extra: extra, dupPays: dupPays, bankDup: bankDup, total: pays.length };
      draw();
    } catch (e) { out.innerHTML = '<div class="aks-bad">No se pudo conciliar: ' + AKS.esc(e.message) + '</div>'; }
  }

  function tbl(title, note, head, rows, bad) {
    return '<div class="admin-card"><h3>' + title + ' <span class="' + (bad && rows.length ? 'aks-bad' : 'aks-muted') + '">(' + rows.length + ')</span></h3><div class="aks-muted">' + note + '</div>' +
      (rows.length ? '<div style="overflow-x:auto"><table class="admin-table"><thead><tr>' + head.map(function (h) { return '<th>' + h + '</th>'; }).join('') +
        '</tr></thead><tbody>' + rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>' :
        '<div class="aks-ok" style="margin-top:.4rem">Sin novedades.</div>') + '</div>';
  }

  function draw() {
    var r = result, pm = function (p) { return p.method === 'pago_movil' ? 'Pago móvil' : 'Transferencia'; };
    $('aksB-out').innerHTML =
      '<div class="admin-card"><strong>' + r.ok.length + '</strong> de ' + r.total + ' pagos del sistema aparecen en el banco · ' +
      '<span class="' + (r.missing.length ? 'aks-bad' : 'aks-ok') + '"><strong>' + r.missing.length + '</strong> sin respaldo</span> · ' +
      '<strong>' + r.extra.length + '</strong> movimientos del banco sin venta</div>' +
      tbl('Pagos del sistema que NO aparecen en el banco', 'Revisa si el cliente aún no pagó, si la referencia se escribió mal o si el pago es falso.',
        ['Factura', 'Fecha', 'Método', 'Monto', 'Referencia'], r.missing.map(function (p) { return [AKS.esc(p.doc), AKS.esc(AKS.fmtDate(p.date)), pm(p), AKS.bs(p.amount), AKS.esc(p.ref || 'sin referencia')]; }), true) +
      tbl('Referencias repetidas en el sistema', 'La misma referencia registrada en más de un pago.',
        ['Factura', 'Método', 'Monto', 'Referencia'], r.dupPays.map(function (p) { return [AKS.esc(p.doc), pm(p), AKS.bs(p.amount), AKS.esc(p.ref)]; }), true) +
      tbl('Movimientos del banco sin venta registrada', 'Dinero que entró al banco y no tiene factura en el sistema.',
        ['Referencia', 'Monto'], r.extra.map(function (b) { return [AKS.esc(b.refRaw), AKS.bs(b.amt)]; }), false) +
      tbl('Pagos conciliados', 'Coinciden referencia y monto con el banco.' + (r.ok.some(function (p) { return p.weak; }) ? ' Los marcados "solo monto" no tenían referencia.' : ''),
        ['Factura', 'Método', 'Monto', 'Referencia', 'Banco'], r.ok.map(function (p) { return [AKS.esc(p.doc), pm(p), AKS.bs(p.amount), AKS.esc(p.ref || '-'), p.weak ? 'solo monto' : 'ref y monto']; }), false);
    $('aksB-csv').style.display = '';
  }

  function download() {
    if (!result) return;
    var q = function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }, L = [['Estado', 'Factura', 'Fecha', 'Método', 'Monto', 'Referencia'].map(q).join(';')];
    result.ok.forEach(function (p) { L.push(['Conciliado', p.doc, p.date, p.method, p.amount, p.ref].map(q).join(';')); });
    result.missing.forEach(function (p) { L.push(['SIN RESPALDO EN BANCO', p.doc, p.date, p.method, p.amount, p.ref].map(q).join(';')); });
    result.extra.forEach(function (b) { L.push(['BANCO SIN VENTA', '', '', '', b.amt, b.refRaw].map(q).join(';')); });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + L.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = 'Conciliacion_' + AKS.dateKey() + '.csv'; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }

  AKS.conciliacion = { parseText: parseText, parseAmount: parseAmount };

  AKS.init(function () {
    if (!AKS.addSection('conciliacion', html())) return;
    $('aksB-file').addEventListener('change', function () {
      var f = this.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () { $('aksB-text').value = String(rd.result); ingest(String(rd.result)); };
      rd.readAsText(f, 'utf-8');
    });
    $('aksB-text').addEventListener('change', function () { ingest(this.value); });
    $('aksB-hdr').addEventListener('change', fillColumns);
    $('aksB-go').addEventListener('click', run);
    $('aksB-csv').addEventListener('click', download);
    AKS.addMenuItem('Conciliar con el banco', 'conciliacion', function () {
      if (!$('aksB-d1').value) { $('aksB-d1').value = AKS.dateKey(new Date(Date.now() - 3 * 86400000)); $('aksB-d2').value = AKS.dateKey(); }
    }, 'caja');
  });
})();
