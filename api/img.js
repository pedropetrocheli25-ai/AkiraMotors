// /api/img?id=ID -> imagen del producto (decodifica el Base64 guardado en Firestore)
const { getDoc } = require('./_fs');

module.exports = async (req, res) => {
  const id = String((req.query && req.query.id) || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60);
  try {
    const p = id ? await getDoc('products/' + id) : null;
    const src = p && (p.thumbnail || (p.images && p.images[0]) || p.image);
    const m = typeof src === 'string' && src.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/);
    if (!m) { res.status(404).end(); return; }
    res.setHeader('Content-Type', m[1]);
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');
    res.status(200).send(Buffer.from(m[2], 'base64'));
  } catch (e) { res.status(404).end(); }
};
