// assets/js/admin/pdf.js
// Generador mínimo de PDF (solo texto, fuente Courier, centrado) para facturas de ticket.
// No usa librerías externas. AKS.pdf.ticket(lines) -> Blob application/pdf
// lines: [{ t: 'texto', b: true|false, s: tamañoPt }]  ('' = línea en blanco, '---' = separador)
(function () {
  'use strict';
  var AKS = window.AKS = window.AKS || {};
  var W = 226.77;          // 80 mm en puntos
  var M = 8;               // margen lateral

  function latin1(s) {
    // WinAnsi: se conservan caracteres hasta U+00FF; el resto se sustituye
    s = String(s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
      .replace(/[–—]/g, '-').replace(/…/g, '...');
    var out = '';
    for (var i = 0; i < s.length; i++) out += s.charCodeAt(i) <= 255 ? s[i] : '?';
    return out;
  }
  function esc(s) { return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }

  function wrap(text, max) {
    var words = String(text).split(/\s+/), out = [], cur = '';
    words.forEach(function (w) {
      while (w.length > max) {
        if (cur) { out.push(cur); cur = ''; }
        out.push(w.slice(0, max)); w = w.slice(max);
      }
      if ((cur ? cur + ' ' : '') .length + w.length <= max) cur = cur ? cur + ' ' + w : w;
      else { out.push(cur); cur = w; }
    });
    if (cur) out.push(cur);
    return out.length ? out : [''];
  }

  function ticket(lines) {
    var rows = [];
    lines.forEach(function (ln) {
      var s = ln.s || 9, t = latin1(ln.t || '');
      var max = Math.floor((W - 2 * M) / (s * 0.6));
      if (t === '---') { rows.push({ t: new Array(max + 1).join('-'), b: false, s: s }); return; }
      if (t === '') { rows.push({ t: '', b: false, s: s }); return; }
      wrap(t, max).forEach(function (part) { rows.push({ t: part, b: !!ln.b, s: s }); });
    });
    var y = 14, content = '';
    rows.forEach(function (r) {
      y += r.s * 1.35;
      if (r.t) {
        var x = Math.max(M, (W - r.t.length * r.s * 0.6) / 2);
        content += 'BT /' + (r.b ? 'F2' : 'F1') + ' ' + r.s + ' Tf ' + x.toFixed(2) + ' @Y' + y.toFixed(2) +
          ' Td (' + esc(r.t) + ') Tj ET\n';
      }
    });
    var H = Math.ceil(y + 16);
    content = content.replace(/@Y([0-9.]+)/g, function (_, v) { return (H - parseFloat(v)).toFixed(2); });

    var objs = [];
    objs.push('<< /Type /Catalog /Pages 2 0 R >>');
    objs.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Contents 4 0 R ' +
      '/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>');
    objs.push('<< /Length ' + content.length + ' >>\nstream\n' + content + 'endstream');
    objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');
    objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>');
    var pdf = '%PDF-1.4\n', offs = [];
    objs.forEach(function (o, i) { offs.push(pdf.length); pdf += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
    var xref = pdf.length;
    pdf += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
    offs.forEach(function (o) { pdf += ('0000000000' + o).slice(-10) + ' 00000 n \n'; });
    pdf += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
    var bytes = new Uint8Array(pdf.length);
    for (var i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 255;
    return new Blob([bytes], { type: 'application/pdf' });
  }

  AKS.pdf = { ticket: ticket };
})();
