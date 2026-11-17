// /robots.txt: el panel de administracion no se indexa
module.exports = (req, res) => {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=86400');
  res.status(200).send('User-agent: *\nDisallow: /admin.html\nAllow: /\n\nSitemap: https://' + host + '/sitemap.xml\n');
};
