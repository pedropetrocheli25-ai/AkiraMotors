// assets/js/admin/cloudinary.js
// Configuración de Cloudinary (alojamiento de fotos por URL) en Ajustes.
// Guarda settings/adminSettings.cloudinary = {cloudName, preset} (solo admin lo lee).
(function () {
  'use strict';
  var AKS = window.AKS;
  if (!AKS) { console.error('cloudinary.js: falta sistema-core.js'); return; }
  function $(id) { return document.getElementById(id); }

  function html(c) {
    return '<div class="admin-card" id="aksC-card"><h3>Fotos de productos (Cloudinary)</h3>' +
      '<div class="alert-info">Las fotos se guardan como enlace y la tienda carga mucho más rápido. ' +
      '1) Crea una cuenta gratis en cloudinary.com. 2) Copia tu <strong>Cloud name</strong> (aparece en el panel). ' +
      '3) Settings → Upload → Upload presets → Add: Signing mode = <strong>Unsigned</strong>, y copia el nombre del preset. ' +
      '4) Pega ambos datos aquí.</div>' +
      '<div class="form-row-3"><div class="form-group"><label>Cloud name</label>' +
      '<input type="text" id="aksC-name" maxlength="60" value="' + AKS.esc(c.cloudName || '') + '"></div>' +
      '<div class="form-group"><label>Upload preset (unsigned)</label>' +
      '<input type="text" id="aksC-preset" maxlength="80" value="' + AKS.esc(c.preset || '') + '"></div></div>' +
      '<button class="btn btn-primary" id="aksC-save">Guardar</button> ' +
      '<span id="aksC-msg" class="aks-muted"></span></div>';
  }

  function mount() {
    var sec = document.getElementById('section-settings');
    if (!sec || $('aksC-card')) return;
    var wrap = document.createElement('div');
    wrap.innerHTML = html({});
    var h2 = sec.querySelector('h2');
    if (h2 && h2.nextSibling) sec.insertBefore(wrap.firstChild, h2.nextSibling); else sec.appendChild(wrap.firstChild);
    // Los valores guardados se leen cuando ya hay sesión iniciada
    firebase.auth().onAuthStateChanged(async function (u) {
      if (!u) return;
      try {
        var s = await AKS.db().collection('settings').doc('adminSettings').get();
        var c = s.exists ? (s.data().cloudinary || {}) : {};
        $('aksC-name').value = c.cloudName || '';
        $('aksC-preset').value = c.preset || '';
      } catch (e) { console.error('cloudinary:', e); }
    });
    $('aksC-save').addEventListener('click', async function () {
      var name = $('aksC-name').value.trim(), preset = $('aksC-preset').value.trim();
      if (!/^[A-Za-z0-9_-]{2,60}$/.test(name)) { alert('Cloud name inválido'); return; }
      if (!/^[A-Za-z0-9_.-]{2,80}$/.test(preset)) { alert('Preset inválido'); return; }
      try {
        await AKS.db().collection('settings').doc('adminSettings')
          .set({ cloudinary: { cloudName: name, preset: preset } }, { merge: true });
        if (typeof window.resetCloudCfg === 'function') window.resetCloudCfg();
        $('aksC-msg').textContent = 'Guardado';
      } catch (e) { alert('No se pudo guardar: ' + e.message); }
    });
  }
  AKS.init(mount);
})();
