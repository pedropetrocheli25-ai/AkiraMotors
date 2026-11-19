// assets/js/admin/exportar.js
// Exporta a Excel (.xlsx) el reporte para el contador:
// semanal, mensual, trimestral, anual o rango personalizado.
// No usa librerías externas: arma el .xlsx (ZIP + XML) en el navegador.
// Requiere sistema-core.js.
(function () {
  'use strict';
  var AKS = window.AKS;
  if (!AKS) { console.error('exportar.js: falta sistema-core.js'); return; }

  var WEB_OK = ['confirmed', 'shipped', 'ready', 'delivered'];
  var METHOD = { efectivo_usd: 'Efectivo $', zelle: 'Zelle $',
    efectivo_bs: 'Efectivo Bs', pago_movil: 'Pago móvil',
    punto: 'Punto de venta', transferencia: 'Transferencia' };

  // ============================================================
  // Mini escritor de .xlsx
  // ============================================================
  var STYLE = { text: 0, head: 1, usd: 2, num: 3, date: 4, int: 5,
    bold: 6, boldusd: 7, boldnum: 8, boldint: 9, title: 10 };

  var crcTable = (function () {
    var t = [], c, n, k;
    for (n = 0; n < 256; n++) {
      c = n;
      for (k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(b) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function zip(files) { // files: [{name, data(Uint8Array)}] sin compresión
    var enc = new TextEncoder(), parts = [], central = [], offset = 0;
    function u16(n) { return [n & 255, (n >>> 8) & 255]; }
    function u32(n) { return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]; }
    files.forEach(function (f) {
      var name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
      var local = [0x50, 0x4b, 0x03, 0x04].concat(u16(20), u16(0x0800), u16(0),
        u16(0), u16(0x21), u32(crc), u32(size), u32(size), u16(name.length), u16(0));
      parts.push(new Uint8Array(local), name, f.data);
      var cen = [0x50, 0x4b, 0x01, 0x02].concat(u16(20), u16(20), u16(0x0800),
        u16(0), u16(0), u16(0x21), u32(crc), u32(size), u32(size),
        u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset));
      central.push(new Uint8Array(cen), name);
      offset += local.length + name.length + size;
    });
    var cdSize = 0;
    central.forEach(function (c) { cdSize += c.length; });
    var end = [0x50, 0x4b, 0x05, 0x06].concat(u16(0), u16(0), u16(files.length),
      u16(files.length), u32(cdSize), u32(offset), u16(0));
    var all = parts.concat(central, [new Uint8Array(end)]);
    var total = 0;
    all.forEach(function (p) { total += p.length; });
    var out = new Uint8Array(total), pos = 0;
    all.forEach(function (p) { out.set(p, pos); pos += p.length; });
    return out;
  }

  function xesc(s) {
    return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function colLetter(i) { // 0 -> A
    var s = '';
    i++;
    while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }
  function serial(key) { // 'YYYY-MM-DD' -> número de fecha de Excel
    var p = String(key).split('-');
    return Math.round((Date.UTC(+p[0], +p[1] - 1, +p[2]) - Date.UTC(1899, 11, 30)) / 86400000);
  }

  // cell: valor simple (usa fmt de la columna) o {v, s, f}
  function cellXml(ref, cell, colFmt) {
    var v = cell, s = colFmt || 'text', f = null;
    if (cell !== null && typeof cell === 'object') {
      v = cell.v; s = cell.s || s; f = cell.f || null;
    }
    var sid = STYLE[s] || 0;
    if (v === null || v === undefined || v === '') {
      return sid ? '<c r="' + ref + '" s="' + sid + '"/>' : '';
    }
    if (s === 'date') v = serial(v);
    if (typeof v === 'number' && isFinite(v)) {
      return '<c r="' + ref + '" s="' + sid + '">' +
        (f ? '<f>' + xesc(f) + '</f>' : '') + '<v>' + v + '</v></c>';
    }
    return '<c r="' + ref + '" s="' + sid + '" t="inlineStr"><is><t xml:space="preserve">' +
      xesc(v) + '</t></is></c>';
  }

  // sheet: {name, cols:[{h, w, fmt, sum}], rows:[[...]], pre:[[...]] (filas antes del encabezado), totalLabel}
  function sheetXml(sh) {
    var rows = [], r = 1, pre = sh.pre || [];
    pre.forEach(function (row) {
      var cells = '';
      row.forEach(function (c, i) { cells += cellXml(colLetter(i) + r, c, null); });
      rows.push('<row r="' + r + '">' + cells + '</row>');
      r++;
    });
    var headerRow = 0;
    if (sh.cols) {
      headerRow = r;
      var hc = '';
      sh.cols.forEach(function (c, i) {
        hc += cellXml(colLetter(i) + r, { v: c.h, s: 'head' }, null);
      });
      rows.push('<row r="' + r + '" ht="30" customHeight="1">' + hc + '</row>');
      r++;
      var first = r;
      (sh.rows || []).forEach(function (row) {
        var cells = '';
        row.forEach(function (c, i) {
          cells += cellXml(colLetter(i) + r, c, sh.cols[i] && sh.cols[i].fmt);
        });
        rows.push('<row r="' + r + '">' + cells + '</row>');
        r++;
      });
      var last = r - 1;
      if (sh.cols.some(function (c) { return c.sum; }) && last >= first) {
        var tc = '';
        sh.cols.forEach(function (c, i) {
          if (i === 0) { tc += cellXml('A' + r, { v: 'TOTAL', s: 'bold' }, null); return; }
          if (c.sum) {
            var tot = 0;
            (sh.rows || []).forEach(function (row) {
              var x = row[i]; x = (x && typeof x === 'object') ? x.v : x;
              if (typeof x === 'number') tot += x;
            });
            var L = colLetter(i);
            tc += cellXml(L + r, { v: Math.round(tot * 100) / 100,
              s: c.fmt === 'int' ? 'boldint' : (c.fmt === 'usd' ? 'boldusd' : 'boldnum'),
              f: 'SUM(' + L + first + ':' + L + last + ')' }, null);
          }
        });
        rows.push('<row r="' + r + '">' + tc + '</row>');
      }
    }
    var widths = (sh.cols ? sh.cols.map(function (c) { return c.w || 14; })
      : (sh.widths || [34, 22, 22]));
    var cols = '<cols>' + widths.map(function (w, i) {
      return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
    }).join('') + '</cols>';
    var view = headerRow
      ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="' + headerRow +
        '" topLeftCell="A' + (headerRow + 1) + '" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
      : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
    var af = (headerRow && sh.rows && sh.rows.length)
      ? '<autoFilter ref="A' + headerRow + ':' + colLetter(sh.cols.length - 1) +
        (headerRow + sh.rows.length) + '"/>' : '';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      view + cols + '<sheetData>' + rows.join('') + '</sheetData>' + af + '</worksheet>';
  }

  var STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="3"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/>' +
    '<numFmt numFmtId="165" formatCode="#,##0.00"/>' +
    '<numFmt numFmtId="166" formatCode="dd/mm/yyyy"/></numFmts>' +
    '<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="14"/><name val="Calibri"/></font></fonts>' +
    '<fills count="4"><fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFF6B1A"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFEEEEEE"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="11">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
    '<xf numFmtId="164" fontId="1" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>' +
    '<xf numFmtId="165" fontId="1" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>' +
    '<xf numFmtId="1" fontId="1" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>' +
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '</cellXfs></styleSheet>';

  function buildXlsx(sheets) {
    var enc = new TextEncoder();
    var files = [];
    function add(name, text) { files.push({ name: name, data: enc.encode(text) }); }
    var ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets.map(function (s, i) {
        return '<Override PartName="/xl/worksheets/sheet' + (i + 1) +
          '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
      }).join('') + '</Types>';
    add('[Content_Types].xml', ct);
    add('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    add('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      sheets.map(function (s, i) {
        var nm = xesc(s.name.replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31));
        return '<sheet name="' + nm + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
      }).join('') + '</sheets></workbook>');
    add('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map(function (s, i) {
        return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
      }).join('') +
      '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
    add('xl/styles.xml', STYLES_XML);
    sheets.forEach(function (s, i) { add('xl/worksheets/sheet' + (i + 1) + '.xml', sheetXml(s)); });
    return zip(files);
  }

  // ============================================================
  // Periodos
  // ============================================================
  function ymd(d) { return AKS.dateKey(d); }
  function parts(key) { var p = key.split('-'); return [+p[0], +p[1], +p[2]]; }

  function computeRange(kind, ref, from, to) {
    var p = parts(ref), y = p[0], m = p[1], d = p[2];
    if (kind === 'week') {
      var dt = new Date(y, m - 1, d);
      var dow = (dt.getDay() + 6) % 7; // lunes = 0
      var a = new Date(y, m - 1, d - dow), b = new Date(y, m - 1, d - dow + 6);
      return [ymd(a), ymd(b), 'Semanal'];
    }
    if (kind === 'month') {
      return [ymd(new Date(y, m - 1, 1)), ymd(new Date(y, m, 0)), 'Mensual'];
    }
    if (kind === 'quarter') {
      var q = Math.floor((m - 1) / 3);
      return [ymd(new Date(y, q * 3, 1)), ymd(new Date(y, q * 3 + 3, 0)), 'Trimestral'];
    }
    if (kind === 'year') {
      return [y + '-01-01', y + '-12-31', 'Anual'];
    }
    return [from, to, 'Personalizado'];
  }

  // ============================================================
  // Datos y hojas
  // ============================================================
  function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function hhmm(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }
  function payText(list) {
    return (list || []).map(function (p) {
      return (METHOD[p.method] || p.method) + ' ' +
        (p.currency === 'USD' ? '$' : 'Bs ') + p.amount;
    }).join(' + ');
  }

  async function collect(d1, d2) {
    var db = AKS.db(), out = { sales: [], purchases: [], orders: [], expenses: [] };
    var s = await db.collection('sales').where('dateKey', '>=', d1)
      .where('dateKey', '<=', d2).get();
    s.forEach(function (d) { out.sales.push(d.data()); });
    var p = await db.collection('purchases').where('invoiceDate', '>=', d1)
      .where('invoiceDate', '<=', d2).get();
    p.forEach(function (d) { out.purchases.push(d.data()); });
    try {
      var ex = await db.collection('expenses').where('dateKey', '>=', d1).where('dateKey', '<=', d2).get();
      ex.forEach(function (d) { out.expenses.push(d.data()); });
      out.expenses.sort(function (a, b) { return String(a.dateKey).localeCompare(String(b.dateKey)); });
    } catch (e) { console.error('expenses:', e); }
    try {
      var o = await db.collection('orders').get();
      o.forEach(function (d) {
        var x = d.data(), dk = String(x.date || '').slice(0, 10);
        if (WEB_OK.indexOf(x.status) !== -1 && dk >= d1 && dk <= d2) {
          x._dk = dk; out.orders.push(x);
        }
      });
    } catch (e) { console.error('orders:', e); }
    out.sales.sort(function (a, b) { return String(a.createdAt).localeCompare(String(b.createdAt)); });
    out.purchases.sort(function (a, b) { return String(a.invoiceDate).localeCompare(String(b.invoiceDate)); });
    out.orders.sort(function (a, b) { return a._dk.localeCompare(b._dk); });
    // inventario actual con costos
    out.inventory = [];
    var prods = await db.collection('products').get(), costs = {};
    var cs = await db.collection('productCosts').get();
    cs.forEach(function (d) { costs[d.id] = Number(d.data().costPrice) || 0; });
    prods.forEach(function (d) {
      var x = d.data();
      out.inventory.push({ code: x.code || '', name: x.name || '', brand: x.brand || '',
        stock: Number(x.stock) || 0, cost: costs[d.id] || 0, price: Number(x.price) || 0 });
    });
    out.inventory.sort(function (a, b) { return a.name.localeCompare(b.name, 'es'); });
    return out;
  }

  function buildSheets(data, d1, d2, label, company) {
    var ok = data.sales.filter(function (s) { return s.status === 'completed'; });
    var T = { n: ok.length, sub: 0, disc: 0, iva: 0, usd: 0, bs: 0, cost: 0, profit: 0 };
    ok.forEach(function (s) {
      T.sub += s.subtotal; T.disc += s.discount || 0; T.iva += s.iva || 0;
      T.usd += s.totalUsd; T.bs += s.totalBs; T.cost += s.costUsd || 0;
      T.profit += s.profitUsd || 0;
    });
    var purchTot = 0, purchOk = data.purchases.filter(function (p) { return p.status !== 'voided'; });
    purchOk.forEach(function (p) { purchTot += p.totalUsd; });
    var expTot = 0, expPend = 0;
    data.expenses.forEach(function (x) { if (!x.purchaseId) expTot += x.amountUsd; if (x.status === 'pending') expPend += x.amountUsd; });
    var webTot = 0;
    data.orders.forEach(function (o) { webTot += Number(o.total) || 0; });

    var K = function (a, b, fmt) { return [{ v: a, s: 'bold' }, { v: b, s: fmt || 'text' }]; };
    var resumen = { name: 'Resumen', widths: [38, 26, 20],
      pre: [
        [{ v: company + ' — Reporte ' + label, s: 'title' }],
        ['Periodo', d1 + ' al ' + d2],
        ['Generado', new Date().toLocaleString('es-VE')],
        ['Nota', 'Documentos internos de control. No son facturas fiscales del SENIAT.'],
        [],
        K('VENTAS DE CAJA (sin anuladas)', ''),
        K('Cantidad de ventas', T.n, 'int'),
        K('Subtotal $', r2(T.sub), 'usd'),
        K('Descuentos $', r2(T.disc), 'usd'),
        K('IVA cobrado $', r2(T.iva), 'usd'),
        K('Total vendido $', r2(T.usd), 'usd'),
        K('Total vendido Bs (a la tasa de cada venta)', r2(T.bs), 'num'),
        K('Costo de lo vendido $', r2(T.cost), 'usd'),
        K('Ganancia estimada $ (antes de IVA)', r2(T.profit), 'usd'),
        [],
        K('COMPRAS A PROVEEDORES', ''),
        K('Facturas de compra', purchOk.length, 'int'),
        K('Total comprado $', r2(purchTot), 'usd'),
        [],
        K('GASTOS DEL PERIODO', ''),
        K('Total gastos $', r2(expTot), 'usd'),
        K('De los cuales por pagar $', r2(expPend), 'usd'),
        K('Resultado estimado $ (ganancia - gastos)', r2(T.profit - expTot), 'usd'),
        [],
        K('PEDIDOS WEB CONFIRMADOS', ''),
        K('Cantidad', data.orders.length, 'int'),
        K('Total $', r2(webTot), 'usd'),
        [],
        K('Ventas anuladas (no incluidas)', data.sales.length - ok.length, 'int')
      ] };

    var ventas = { name: 'Ventas', cols: [
      { h: 'Fecha', w: 12, fmt: 'date' }, { h: 'Hora', w: 8 },
      { h: 'N° venta', w: 12 }, { h: 'Cliente', w: 24 }, { h: 'Teléfono', w: 14 },
      { h: 'Subtotal $', w: 12, fmt: 'usd', sum: true },
      { h: 'Descuento $', w: 12, fmt: 'usd', sum: true },
      { h: 'IVA $', w: 11, fmt: 'usd', sum: true },
      { h: 'Total $', w: 12, fmt: 'usd', sum: true },
      { h: 'Tasa BCV', w: 10, fmt: 'num' },
      { h: 'Total Bs', w: 15, fmt: 'num', sum: true },
      { h: 'Costo $', w: 12, fmt: 'usd', sum: true },
      { h: 'Ganancia $', w: 12, fmt: 'usd', sum: true },
      { h: 'Forma de pago', w: 34 }, { h: 'Vendedor', w: 24 },
      { h: 'Estado', w: 12 }], rows: [] };
    data.sales.forEach(function (s) {
      var live = s.status === 'completed', z = function (n) { return live ? r2(n) : 0; };
      ventas.rows.push([s.dateKey, hhmm(s.createdAt), s.saleNumber,
        s.customerName || '', s.customerPhone || '',
        z(s.subtotal), z(s.discount), z(s.iva), z(s.totalUsd), r2(s.rate),
        z(s.totalBs), z(s.costUsd), z(s.profitUsd), payText(s.payments),
        s.seller || '', live ? 'Completada' : 'Anulada']);
    });

    var lineas = { name: 'Detalle productos', cols: [
      { h: 'Fecha', w: 12, fmt: 'date' }, { h: 'N° venta', w: 12 },
      { h: 'Código', w: 14 }, { h: 'Producto', w: 40 },
      { h: 'Cant.', w: 8, fmt: 'int', sum: true },
      { h: 'Precio unit. $', w: 14, fmt: 'usd' },
      { h: 'Total línea $', w: 14, fmt: 'usd', sum: true },
      { h: 'Costo unit. $', w: 13, fmt: 'usd' },
      { h: 'Ganancia $', w: 13, fmt: 'usd', sum: true }], rows: [] };
    var agg = {}, byDay = {}, byPay = {};
    ok.forEach(function (s) {
      (s.items || []).forEach(function (it) {
        var gain = r2(it.lineTotal - it.unitCost * it.qty);
        lineas.rows.push([s.dateKey, s.saleNumber, it.code, it.name, it.qty,
          r2(it.unitPrice), r2(it.lineTotal), r2(it.unitCost), gain]);
        var k = it.code + '|' + it.name;
        agg[k] = agg[k] || { code: it.code, name: it.name, q: 0, usd: 0, cost: 0 };
        agg[k].q += it.qty; agg[k].usd += it.lineTotal; agg[k].cost += it.unitCost * it.qty;
      });
      var d = byDay[s.dateKey] = byDay[s.dateKey] || { n: 0, usd: 0, bs: 0, iva: 0, profit: 0 };
      d.n++; d.usd += s.totalUsd; d.bs += s.totalBs; d.iva += s.iva || 0; d.profit += s.profitUsd || 0;
      (s.payments || []).forEach(function (p) {
        var b = byPay[p.method] = byPay[p.method] || { n: 0, amt: 0, cur: p.currency, usd: 0 };
        b.n++; b.amt += p.amount; b.usd += p.amountUsd;
      });
    });

    var prod = { name: 'Productos vendidos', cols: [
      { h: 'Código', w: 14 }, { h: 'Producto', w: 42 },
      { h: 'Unidades', w: 11, fmt: 'int', sum: true },
      { h: 'Total vendido $', w: 16, fmt: 'usd', sum: true },
      { h: 'Costo $', w: 13, fmt: 'usd', sum: true },
      { h: 'Ganancia $', w: 13, fmt: 'usd', sum: true }],
      rows: Object.keys(agg).map(function (k) { return agg[k]; })
        .sort(function (a, b) { return b.usd - a.usd; })
        .map(function (a) { return [a.code, a.name, a.q, r2(a.usd), r2(a.cost), r2(a.usd - a.cost)]; }) };

    var dia = { name: 'Por día', cols: [
      { h: 'Fecha', w: 12, fmt: 'date' }, { h: 'N° ventas', w: 11, fmt: 'int', sum: true },
      { h: 'Total $', w: 14, fmt: 'usd', sum: true }, { h: 'Total Bs', w: 16, fmt: 'num', sum: true },
      { h: 'IVA $', w: 12, fmt: 'usd', sum: true }, { h: 'Ganancia $', w: 13, fmt: 'usd', sum: true }],
      rows: Object.keys(byDay).sort().map(function (k) {
        var d = byDay[k]; return [k, d.n, r2(d.usd), r2(d.bs), r2(d.iva), r2(d.profit)];
      }) };

    var pago = { name: 'Por forma de pago', cols: [
      { h: 'Forma de pago', w: 24 }, { h: 'N° pagos', w: 10, fmt: 'int', sum: true },
      { h: 'Moneda', w: 10 }, { h: 'Monto recibido', w: 16, fmt: 'num' },
      { h: 'Equivalente $', w: 15, fmt: 'usd', sum: true }],
      rows: Object.keys(byPay).map(function (k) {
        var b = byPay[k];
        return [METHOD[k] || k, b.n, b.cur === 'USD' ? 'USD' : 'Bs', r2(b.amt), r2(b.usd)];
      }) };

    var comp = { name: 'Compras', cols: [
      { h: 'Fecha factura', w: 13, fmt: 'date' }, { h: 'Proveedor', w: 26 },
      { h: 'N° factura', w: 14 }, { h: 'Código', w: 14 }, { h: 'Producto', w: 40 },
      { h: 'Cant.', w: 8, fmt: 'int', sum: true }, { h: 'Costo unit. $', w: 14, fmt: 'usd' },
      { h: 'Total línea $', w: 14, fmt: 'usd', sum: true }, { h: 'Estado', w: 11 }], rows: [] };
    data.purchases.forEach(function (p) {
      var live = p.status !== 'voided';
      (p.items || []).forEach(function (it) {
        comp.rows.push([p.invoiceDate, p.supplier, p.invoiceNumber, it.code, it.name,
          live ? it.qty : 0, r2(it.unitCost), live ? r2(it.lineTotal) : 0,
          live ? 'Activa' : 'Anulada']);
      });
    });

    var gas = { name: 'Gastos', cols: [
      { h: 'Fecha', w: 12, fmt: 'date' }, { h: 'Categoría', w: 28 }, { h: 'Descripción', w: 40 },
      { h: 'Monto $', w: 13, fmt: 'usd', sum: true }, { h: 'Estado', w: 12 }, { h: 'Vence', w: 12 }],
      rows: data.expenses.map(function (x) {
        return [x.dateKey, x.category, x.description || '', r2(x.amountUsd), x.status === 'paid' ? 'Pagado' : 'Pendiente', x.dueDate || ''];
      }) };

    var web = { name: 'Pedidos web', cols: [
      { h: 'Fecha', w: 12, fmt: 'date' }, { h: 'Código pedido', w: 16 },
      { h: 'Cliente', w: 26 }, { h: 'Teléfono', w: 14 },
      { h: 'Subtotal $', w: 12, fmt: 'usd', sum: true }, { h: 'Descuento $', w: 12, fmt: 'usd', sum: true },
      { h: 'IVA $', w: 11, fmt: 'usd', sum: true }, { h: 'Delivery $', w: 11, fmt: 'usd', sum: true },
      { h: 'Total $', w: 12, fmt: 'usd', sum: true }, { h: 'Estado', w: 12 }],
      rows: data.orders.map(function (o) {
        return [o._dk, o.orderCode || '', o.userName || '', o.userPhone || '',
          r2(o.subtotal), r2(o.discount), r2(o.iva), r2(o.deliveryFee), r2(o.total), o.status];
      }) };

    var inv = { name: 'Inventario actual', cols: [
      { h: 'Código', w: 14 }, { h: 'Producto', w: 42 }, { h: 'Marca', w: 16 },
      { h: 'Existencia', w: 11, fmt: 'int', sum: true },
      { h: 'Costo unit. $', w: 13, fmt: 'usd' }, { h: 'Precio venta $', w: 14, fmt: 'usd' },
      { h: 'Valor al costo $', w: 16, fmt: 'usd', sum: true },
      { h: 'Valor a precio de venta $', w: 20, fmt: 'usd', sum: true }],
      rows: data.inventory.map(function (x) {
        return [x.code, x.name, x.brand, x.stock, r2(x.cost), r2(x.price),
          r2(x.stock * x.cost), r2(x.stock * x.price)];
      }) };

    return [resumen, ventas, lineas, prod, dia, pago, comp, gas, web, inv];
  }

  // ============================================================
  // Interfaz
  // ============================================================
  function $(id) { return document.getElementById(id); }

  function rangeFromUi() {
    var kind = $('aksX-kind').value, ref = $('aksX-ref').value;
    if (kind !== 'custom' && !ref) { alert('Elige una fecha de referencia'); return null; }
    var from = $('aksX-from').value, to = $('aksX-to').value;
    if (kind === 'custom' && (!from || !to || from > to)) {
      alert('Elige un rango de fechas válido'); return null;
    }
    return computeRange(kind, ref, from, to);
  }

  function updateLabel() {
    var kind = $('aksX-kind').value;
    $('aksX-custom').style.display = kind === 'custom' ? '' : 'none';
    $('aksX-refwrap').style.display = kind === 'custom' ? 'none' : '';
    var el = $('aksX-label');
    if (kind === 'custom' && !($('aksX-from').value && $('aksX-to').value)) { el.textContent = ''; return; }
    if (kind !== 'custom' && !$('aksX-ref').value) { el.textContent = ''; return; }
    var r = computeRange(kind, $('aksX-ref').value, $('aksX-from').value, $('aksX-to').value);
    el.textContent = 'Periodo: ' + AKS.fmtDate(r[0]) + ' al ' + AKS.fmtDate(r[1]);
  }

  function download(bytes, name) {
    var blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  async function exportar() {
    var rg = rangeFromUi();
    if (!rg) return;
    var btn = $('aksX-go');
    btn.disabled = true;
    btn.textContent = 'Generando...';
    try {
      var settings = await AKS.getSettings(true);
      var data = await collect(rg[0], rg[1]);
      var sheets = buildSheets(data, rg[0], rg[1], rg[2], settings.companyName);
      var bytes = buildXlsx(sheets);
      var fname = 'Reporte_' + rg[2] + '_' + rg[0] + '_a_' + rg[1] + '.xlsx';
      download(bytes, fname);
      AKS.lastExport = { name: fname, bytes: bytes, sheets: sheets };
    } catch (e) {
      console.error('Exportar:', e);
      alert('No se pudo generar el Excel: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Descargar Excel';
    }
  }

  AKS.init(function () {
    var sec = $('section-dashboard');
    if (!sec) return;
    var card = document.createElement('div');
    card.className = 'admin-card';
    card.innerHTML = '<h3>Exportar a Excel para el contador</h3>' +
      '<div class="aks-muted" style="margin-bottom:.6rem">Incluye resumen, ventas, ' +
      'detalle por producto, productos vendidos, por día, formas de pago, compras, ' +
      'pedidos web e inventario actual.</div>' +
      '<div class="aks-inline"><select id="aksX-kind">' +
      '<option value="week">Semanal (lunes a domingo)</option>' +
      '<option value="month" selected>Mensual</option>' +
      '<option value="quarter">Trimestral</option>' +
      '<option value="year">Anual</option>' +
      '<option value="custom">Rango personalizado</option></select>' +
      '<span id="aksX-refwrap"><input type="date" id="aksX-ref"> ' +
      '<span class="aks-muted">(cualquier fecha dentro del periodo)</span></span>' +
      '<span id="aksX-custom" style="display:none"><input type="date" id="aksX-from"> ' +
      'a <input type="date" id="aksX-to"></span>' +
      '<button class="btn btn-primary" id="aksX-go">Descargar Excel</button></div>' +
      '<div id="aksX-label" class="aks-muted" style="margin-top:.5rem"></div>';
    sec.appendChild(card);
    $('aksX-ref').value = AKS.dateKey();
    ['aksX-kind', 'aksX-ref', 'aksX-from', 'aksX-to'].forEach(function (id) {
      $(id).addEventListener('change', updateLabel);
    });
    $('aksX-go').addEventListener('click', exportar);
    updateLabel();
  });

  AKS.exportar = { build: buildXlsx, sheets: buildSheets, range: computeRange, run: exportar };
})();
