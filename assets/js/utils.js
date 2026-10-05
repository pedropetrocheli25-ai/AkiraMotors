// assets/js/utils.js
// Funciones auxiliares que se usan en toda la web.

// Escapa HTML para prevenir XSS
export function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);
}

// Retrasa la ejecución de una función (para buscadores)
export function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// Formatea precios con la tasa BCV
export function formatPrices(price, discount, bcvRate) {
  const finalPrice = discount > 0 ? price - (price * discount / 100) : price;
  const priceBs = finalPrice * bcvRate;
  return { finalPrice, priceBs, hasDiscount: discount > 0 };
}

// Valida que una URL sea http/https
export function safeUrl(url) {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return '';
}

// Abre y cierra modales
export function openModal(id) {
  document.getElementById(id)?.classList.add('active');
}
export function closeModal(id) {
  document.getElementById(id)?.classList.remove('active');
}