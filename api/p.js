// /p/ID -> pagina con vista previa (Open Graph) y redireccion a /?p=ID
const { getDoc } = require('./_fs');

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = async (req, res) => {
  const id = String((req.query && req.query.id) || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60);
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const origin = 'https://' + host;
  const target = origin + '/' + (id ? '?p=' + id : '');
  let title = 'Akira Motors - Repuestos', desc = 'Catálogo de repuestos automotrices', img = '';
  try {
    if (id) {
      const p = await getDoc('products/' + id);
      if (p && p.name) {
        const disc = Number(p.discount) || 0;
        const usd = (Number(p.price) || 0) * (disc > 0 ? 1 - disc / 100 : 1);
        let bs = '';
        try {
          const r = await getDoc('settings/bcvRate');
          if (r && r.value) bs = ' / Bs. ' + (usd * Number(r.value)).toFixed(2);
        } catch (e) {}
        title = p.name;
        desc = 'Precio: $' + usd.toFixed(2) + bs + (p.code ? ' · Cód. ' + p.code : '') +
          ' · Pide por WhatsApp en Akira Motors';
        if (p.thumbnail || (p.images && p.images[0]) || p.image) img = origin + '/api/img?id=' + id;
      }
    }
  } catch (e) { /* sin vista previa: igual redirige */ }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  res.status(200).send('<!doctype html><html lang="es"><head><meta charset="utf-8">' +
    '<title>' + esc(title) + '</title>' +
    '<meta name="description" content="' + esc(desc) + '">' +
    '<meta property="og:type" content="product"><meta property="og:site_name" content="Akira Motors">' +
    '<meta property="og:title" content="' + esc(title) + '">' +
    '<meta property="og:description" content="' + esc(desc) + '">' +
    '<meta property="og:url" content="' + esc(origin + '/p/' + id) + '">' +
    (img ? '<meta property="og:image" content="' + esc(img) + '"><meta name="twitter:card" content="summary_large_image">' : '') +
    '<meta http-equiv="refresh" content="0;url=' + esc(target) + '">' +
    '</head><body><script>location.replace(' + JSON.stringify(target) + ')</script>' +
    '<a href="' + esc(target) + '">Ver producto</a></body></html>');
};
