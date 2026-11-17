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

// Ids de todos los productos (lectura publica)
async function listProductIds() {
  const ids = [];
  let token = '';
  for (let n = 0; n < 20; n++) {
    const r = await fetch(BASE + 'products?pageSize=300&mask.fieldPaths=name' + (token ? '&pageToken=' + encodeURIComponent(token) : ''));
    if (!r.ok) break;
    const d = await r.json();
    (d.documents || []).forEach(x => ids.push(x.name.split('/').pop()));
    token = d.nextPageToken || '';
    if (!token) break;
  }
  return ids;
}
module.exports.listProductIds = listProductIds;
