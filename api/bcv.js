// /api/bcv: consulta la tasa oficial (BCV) publicada por DolarApi.
// Solo la sugiere: el dueño la confirma en el admin antes de guardarla.
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'public, s-maxage=900');
  try {
    const r = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
    if (!r.ok) throw new Error('fuente no disponible');
    const d = await r.json();
    const v = Number(d.promedio);
    if (!(v > 0 && v < 1e7)) throw new Error('valor inválido');
    res.status(200).json({ value: Math.round(v * 100) / 100, date: d.fechaActualizacion || '', source: 've.dolarapi.com (oficial BCV)' });
  } catch (e) {
    res.status(502).json({ error: 'No se pudo consultar la tasa' });
  }
};
