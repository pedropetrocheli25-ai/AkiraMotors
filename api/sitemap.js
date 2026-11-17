// /sitemap.xml: pagina principal y un enlace por producto
const { listProductIds } = require('./_fs');
module.exports = async (req, res) => {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const o = 'https://' + host;
  let ids = [];
  try { ids = await listProductIds(); } catch (e) {}
  const urls = [o + '/', o + '/quienes-somos.html'].concat(ids.map(i => o + '/p/' + i));
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    urls.map(u => '<url><loc>' + u.replace(/&/g, '&amp;') + '</loc></url>').join('') + '</urlset>');
};
