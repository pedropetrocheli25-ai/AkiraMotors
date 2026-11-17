// Lectura publica de un producto y de la tasa por la API REST de Firestore.
const BASE = 'https://firestore.googleapis.com/v1/projects/akiramotors-cc498/databases/(default)/documents/';

function val(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(val);
  if ('mapValue' in v) return obj(v.mapValue.fields || {});
  return null;
}
function obj(f) { const o = {}; for (const k in f) o[k] = val(f[k]); return o; }

async function getDoc(path) {
  const r = await fetch(BASE + path);
  if (!r.ok) return null;
  const d = await r.json();
  return obj(d.fields || {});
}
module.exports = { getDoc };
