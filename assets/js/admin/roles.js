// assets/js/admin/roles.js
// Rol "cajero": solo ve Caja, Facturas, Clientes y Cierre de caja.
// El dueño (sin role o role distinto de 'cajero') ve todo.
// La seguridad real está en firestore.rules; esto solo ordena la pantalla.
(function () {
  'use strict';
  var AKS = window.AKS;
  if (!AKS) { console.error('roles.js: falta sistema-core.js'); return; }
  var ALLOWED = ['caja', 'facturas', 'clientes', 'cierres'];
  AKS.role = 'dueno';

  function apply() {
    document.body.classList.add('aks-cashier');
    var menu = document.querySelector('.admin-menu');
    if (!menu) return;
    var kids = menu.children, group = null, count = 0, i, el;
    function closeGroup() { if (group && !count) group.style.display = 'none'; }
    for (i = 0; i < kids.length; i++) {
      el = kids[i];
      if (el.classList.contains('admin-menu-group')) { closeGroup(); group = el; count = 0; continue; }
      if (el.classList.contains('admin-menu-item')) {
        var oc = el.getAttribute('onclick') || '';
        if (oc.indexOf('logoutAdmin') !== -1) continue;
        var id = el.getAttribute('data-aks');
        if (ALLOWED.indexOf(id) === -1) el.style.display = 'none'; else count++;
      }
    }
    closeGroup();
    var orig = window.showSection;
    window.showSection = function (id, ev) {
      if (ALLOWED.indexOf(id) === -1) id = 'caja';
      return orig.call(this, id, ev);
    };
    var go = menu.querySelector('[data-aks="caja"]');
    if (go) go.click();
  }

  AKS.init(function () {
    var st = document.createElement('style');
    st.textContent = '.aks-cashier [data-act="void"]{display:none!important}';
    document.head.appendChild(st);
    firebase.auth().onAuthStateChanged(async function (u) {
      if (!u) return;
      try {
        var s = await AKS.db().collection('admins').doc(u.uid).get();
        if (s.exists && s.data().role === 'cajero') { AKS.role = 'cajero'; apply(); }
      } catch (e) { console.error('roles', e); }
    });
  });
})();
