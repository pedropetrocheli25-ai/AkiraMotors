// assets/js/admin/logo.js
// Logo de la tienda: subir, ver y quitar. Se guarda en settings/logo
// (la tienda ya lo lee y lo muestra en el encabezado).
// Requiere sistema-core.js.
(function () {
  'use strict';
  var AKS = window.AKS;
  if (!AKS) { console.error('logo.js: falta sistema-core.js'); return; }

  var MAX_FILE = 5 * 1024 * 1024; // 5 MB de archivo original
  var SIZE = 256;                 // se guarda en 256x256 máx.
  var pending = null;             // imagen lista para guardar
  function $(id) { return document.getElementById(id); }

  function prepare(file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
        reject(new Error('Usa una imagen PNG, JPG o WEBP')); return;
      }
      if (file.size > MAX_FILE) { reject(new Error('La imagen pesa más de 5 MB')); return; }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) { reject(new Error('Imagen inválida')); return; }
        var k = Math.min(1, SIZE / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
        var cv = document.createElement('canvas');
        var side = Math.max(cw, ch);   // cuadrado, centrado (no se recorta)
        cv.width = side; cv.height = side;
        cv.getContext('2d').drawImage(img, Math.round((side - cw) / 2),
          Math.round((side - ch) / 2), cw, ch);
        // PNG conserva fondo transparente; si pesa mucho, usa JPG
        var out = cv.toDataURL('image/png');
        if (out.length > 200000) out = cv.toDataURL('image/jpeg', 0.85);
        resolve(out);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
      img.src = url;
    });
  }

  function show(src) {
    $('aksL-prev').innerHTML = src
      ? '<img alt="Logo" src="' + AKS.esc(src) + '" style="width:100%;height:100%;object-fit:cover">'
      : '<span class="aks-muted" style="font-size:.7rem">Sin logo</span>';
  }

  async function load() {
    try {
      var s = await AKS.db().collection('settings').doc('logo').get();
      show(s.exists ? s.data().image : '');
    } catch (e) { console.error(e); }
  }

  async function save() {
    if (!pending) { alert('Primero elige una imagen'); return; }
    var btn = $('aksL-save');
    btn.disabled = true;
    try {
      await AKS.db().collection('settings').doc('logo').set({
        image: pending, updatedAt: new Date().toISOString() });
      pending = null;
      $('aksL-file').value = '';
      alert('Logo guardado. Ya aparece en la tienda.');
    } catch (e) {
      console.error(e);
      alert('No se pudo guardar: ' + e.message);
    } finally { btn.disabled = false; }
  }

  async function remove() {
    if (!confirm('¿Quitar el logo de la tienda?')) return;
    try {
      await AKS.db().collection('settings').doc('logo').delete();
      pending = null;
      show('');
    } catch (e) { alert('No se pudo quitar: ' + e.message); }
  }

  AKS.init(function () {
    var sec = $('section-settings');
    if (!sec) return;
    var card = document.createElement('div');
    card.className = 'admin-card';
    card.innerHTML = '<h3>Logo de la tienda</h3>' +
      '<div class="alert-info">Aparece en el encabezado de la tienda dentro de un círculo. ' +
      'Usa una imagen cuadrada (PNG, JPG o WEBP).</div>' +
      '<div class="aks-inline"><div id="aksL-prev" style="width:84px;height:84px;border-radius:50%;' +
      'background:#FF6B1A;overflow:hidden;display:flex;align-items:center;justify-content:center"></div>' +
      '<div><input type="file" id="aksL-file" accept="image/png,image/jpeg,image/webp"></div></div>' +
      '<div class="aks-inline" style="margin-top:.8rem"><button class="btn btn-primary" id="aksL-save">Guardar logo</button>' +
      '<button class="btn btn-danger" id="aksL-del">Quitar logo</button></div>';
    var h = sec.querySelector('h2');
    if (h && h.nextSibling) sec.insertBefore(card, h.nextSibling); else sec.appendChild(card);
    $('aksL-file').addEventListener('change', async function () {
      var f = this.files && this.files[0];
      if (!f) return;
      try { pending = await prepare(f); show(pending); }
      catch (e) { pending = null; this.value = ''; alert(e.message); }
    });
    $('aksL-save').addEventListener('click', save);
    $('aksL-del').addEventListener('click', remove);
    // Cargar el logo actual al abrir Ajustes
    var item = document.querySelector('.admin-menu-item[onclick*="\'settings\'"]');
    if (item) item.addEventListener('click', load);
    load().catch(function () {});
  });
  AKS.logo = { load: load };
})();
