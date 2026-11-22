// assets/js/admin/clientes.js
// Clientes del negocio (para la Caja y las facturas). Colección 'clients'.
// Requiere sistema-core.js.
(function () {
  'use strict';
  var AKS = window.AKS;
  if (!AKS) { console.error('clientes.js: falta sistema-core.js'); return; }

  var root = null;
  var list = [];
  var editId = null;

  function $(id) { return document.getElementById(id); }

  // Para comparar y buscar: sin puntos, guiones ni espacios (V-12.123.123 = V12123123 = 12123123 con V)
  function normDoc(s) {
    return String(s || '').toUpperCase().replace(/[\s.\-]/g, '');
  }
  // Formato guardado: si solo escribe números es cédula venezolana (V). Ej: 12.123.123 -> V-12123123
  function fmtDoc(s) {
    var d = normDoc(s);
    if (!d) return '';
    if (/^\d/.test(d)) d = 'V' + d;
    return d.replace(/^([A-Z])/, '$1-');
  }

  // ------------------------------------------------------------
  // Datos compartidos con la Caja
  // ------------------------------------------------------------
  async function load(force) {
    if (list.length && !force) return list;
    var snap = await AKS.db().collection('clients').get();
    list = [];
    snap.forEach(function (d) {
      var c = d.data(); c.id = d.id; list.push(c);
    });
    list.sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'es'); });
    return list;
  }

  function search(q, limit) {
    var n = AKS.norm(q), d = normDoc(q);
    if (!n) return [];
    return list.filter(function (c) {
      return AKS.norm(c.name).indexOf(n) !== -1 ||
        (d && normDoc(c.doc).indexOf(d) !== -1) ||
        String(c.phone || '').indexOf(q.trim()) !== -1;
    }).slice(0, limit || 8);
  }

  function findByDoc(doc) {
    var d = normDoc(fmtDoc(doc));
    if (!d) return null;
    return list.filter(function (c) { return normDoc(c.doc) === d; })[0] || null;
  }

  // Crea el cliente si hay RIF/Cédula y nombre y todavía no existe
  async function ensure(data) {
    var name = String(data.name || '').trim();
    var doc = fmtDoc(data.doc);
    if (!name || !doc) return null;
    await load(false);
    var ex = findByDoc(doc);
    if (ex) return ex.id;
    var ref = AKS.db().collection('clients').doc();
    var now = new Date().toISOString();
    var rec = { name: name, nameKey: AKS.norm(name), doc: doc,
      phone: String(data.phone || '').trim(), email: '', address: '', notes: '',
      purchases: 0, totalSpentUsd: 0, createdAt: now, updatedAt: now,
      createdBy: AKS.userLabel() };
    await ref.set(rec);
    rec.id = ref.id;
    list.push(rec);
    return ref.id;
  }

  // ------------------------------------------------------------
  // Pantalla
  // ------------------------------------------------------------
  function html() {
    return '<h2 class="section-title">Clientes</h2>' +
      '<div class="admin-card"><h3 id="aksCl-title">Nuevo cliente</h3>' +
      '<div class="form-row-3">' +
      '<div class="form-group"><label>Nombre o razón social *</label>' +
      '<input type="text" id="aksCl-name" maxlength="100"></div>' +
      '<div class="form-group"><label>RIF / Cédula *</label>' +
      '<input type="text" id="aksCl-doc" maxlength="20" placeholder="12.123.123 (si es RIF: J123456789)"></div>' +
      '<div class="form-group"><label>Teléfono</label>' +
      '<input type="tel" id="aksCl-phone" maxlength="11" placeholder="0412XXXXXXX"></div></div>' +
      '<div class="form-row-3">' +
      '<div class="form-group"><label>Correo</label><input type="email" id="aksCl-email" maxlength="120"></div>' +
      '<div class="form-group"><label>Dirección</label><input type="text" id="aksCl-addr" maxlength="200"></div>' +
      '<div class="form-group"><label>Notas</label><input type="text" id="aksCl-notes" maxlength="200" ' +
      'placeholder="Ej: taller, paga a crédito, vehículo..."></div></div>' +
      '<div class="aks-inline"><button class="btn btn-primary" id="aksCl-save">Guardar cliente</button>' +
      '<button class="btn btn-secondary" id="aksCl-cancel" style="display:none">Cancelar edición</button></div></div>' +
      '<div class="admin-card"><h3>Lista de clientes</h3>' +
      '<input type="text" id="aksCl-search" class="aks-search" placeholder="Buscar por nombre, RIF/cédula o teléfono...">' +
      '<div id="aksCl-list" class="aks-muted" style="margin-top:.8rem">Cargando...</div>' +
      '<div id="aksCl-hist"></div></div>';
  }

  function render() {
    var q = AKS.norm($('aksCl-search').value), d = normDoc($('aksCl-search').value);
    var rows = list.filter(function (c) {
      if (!q) return true;
      return AKS.norm(c.name).indexOf(q) !== -1 || (d && normDoc(c.doc).indexOf(d) !== -1) ||
        String(c.phone || '').indexOf($('aksCl-search').value.trim()) !== -1;
    });
    if (!rows.length) {
      $('aksCl-list').innerHTML = list.length ? 'Sin resultados.' : 'Todavía no hay clientes registrados.';
      return;
    }
    $('aksCl-list').innerHTML = '<div class="aks-wrap"><table class="aks-table"><thead><tr>' +
      '<th>Nombre</th><th>RIF / Cédula</th><th>Teléfono</th><th>Compras</th><th>Total comprado</th>' +
      '<th></th></tr></thead><tbody>' + rows.map(function (c) {
        return '<tr><td><strong>' + AKS.esc(c.name) + '</strong>' +
          (c.notes ? '<br><span class="aks-muted">' + AKS.esc(c.notes) + '</span>' : '') + '</td><td>' +
          AKS.esc(c.doc) + '</td><td>' + AKS.esc(c.phone || '') + '</td><td>' + (c.purchases || 0) +
          '</td><td>' + AKS.usd(c.totalSpentUsd || 0) + '</td><td>' +
          '<button class="btn btn-secondary btn-small" data-act="hist" data-id="' + AKS.esc(c.id) + '">Compras</button> ' +
          '<button class="btn btn-secondary btn-small" data-act="edit" data-id="' + AKS.esc(c.id) + '">Editar</button> ' +
          '<button class="btn btn-danger btn-small" data-act="del" data-id="' + AKS.esc(c.id) + '">Eliminar</button>' +
          '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function resetForm() {
    editId = null;
    ['name', 'doc', 'phone', 'email', 'addr', 'notes'].forEach(function (k) { $('aksCl-' + k).value = ''; });
    $('aksCl-title').textContent = 'Nuevo cliente';
    $('aksCl-cancel').style.display = 'none';
  }

  async function save() {
    var name = $('aksCl-name').value.trim();
    var doc = fmtDoc($('aksCl-doc').value);
    var phone = $('aksCl-phone').value.trim();
    var email = $('aksCl-email').value.trim();
    if (name.length < 2) { alert('Escribe el nombre del cliente'); return; }
    if (!/^[VEJGPC]-[0-9]{5,10}$/.test(doc)) {
      alert('RIF / Cédula inválido. Escribe solo los números de la cédula (12.123.123) o con letra para RIF (J123456789)'); return;
    }
    if (phone && !/^04\d{9}$/.test(phone)) { alert('Teléfono: formato 0412XXXXXXX'); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { alert('Correo inválido'); return; }
    var dup = findByDoc(doc);
    if (dup && dup.id !== editId) { alert('Ya existe un cliente con ese RIF / Cédula: ' + dup.name); return; }
    var btn = $('aksCl-save');
    btn.disabled = true;
    try {
      var now = new Date().toISOString();
      var data = { name: name, nameKey: AKS.norm(name), doc: doc, phone: phone, email: email,
        address: $('aksCl-addr').value.trim(), notes: $('aksCl-notes').value.trim(), updatedAt: now };
      if (editId) {
        await AKS.db().collection('clients').doc(editId).update(data);
      } else {
        data.purchases = 0; data.totalSpentUsd = 0; data.createdAt = now; data.createdBy = AKS.userLabel();
        await AKS.db().collection('clients').doc().set(data);
      }
      resetForm();
      await load(true);
      render();
    } catch (e) {
      console.error(e);
      alert('No se pudo guardar: ' + e.message);
    } finally { btn.disabled = false; }
  }

  async function history(c) {
    var box = $('aksCl-hist');
    box.innerHTML = '<div class="aks-muted" style="margin-top:1rem">Cargando compras...</div>';
    try {
      var snap = await AKS.db().collection('sales').where('clientId', '==', c.id).get();
      var rows = [];
      snap.forEach(function (d) { rows.push(d.data()); });
      rows.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
      var h = '<h3 style="margin:1rem 0 .5rem">Compras de ' + AKS.esc(c.name) + '</h3>';
      if (!rows.length) { box.innerHTML = h + '<div class="aks-muted">Sin compras registradas.</div>'; return; }
      h += '<div class="aks-wrap"><table class="aks-table"><thead><tr><th>Fecha</th><th>Factura</th>' +
        '<th>Productos</th><th>Total</th><th>Estado</th></tr></thead><tbody>' + rows.map(function (s) {
          return '<tr><td>' + AKS.esc(AKS.fmtDateTime(s.createdAt)) + '</td><td>' + AKS.esc(s.saleNumber) +
            '</td><td>' + (s.items || []).map(function (i) { return AKS.esc(i.qty + ' x ' + i.name); }).join('<br>') +
            '</td><td>' + AKS.usd(s.totalUsd) + '</td><td>' +
            (s.status === 'completed' ? '<span class="aks-ok">Completada</span>' : '<span class="aks-bad">Anulada</span>') +
            '</td></tr>';
        }).join('') + '</tbody></table></div>';
      box.innerHTML = h;
    } catch (e) {
      box.innerHTML = '<span class="aks-bad">' + AKS.esc(e.message) + '</span>';
    }
  }

  function bind() {
    $('aksCl-save').addEventListener('click', save);
    $('aksCl-cancel').addEventListener('click', resetForm);
    $('aksCl-search').addEventListener('input', render);
    root.addEventListener('click', async function (ev) {
      var act = ev.target.getAttribute && ev.target.getAttribute('data-act');
      if (!act) return;
      var c = list.filter(function (x) { return x.id === ev.target.getAttribute('data-id'); })[0];
      if (!c) return;
      if (act === 'edit') {
        editId = c.id;
        $('aksCl-name').value = c.name; $('aksCl-doc').value = c.doc; $('aksCl-phone').value = c.phone || '';
        $('aksCl-email').value = c.email || ''; $('aksCl-addr').value = c.address || '';
        $('aksCl-notes').value = c.notes || '';
        $('aksCl-title').textContent = 'Editar cliente';
        $('aksCl-cancel').style.display = '';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (act === 'hist') {
        history(c);
      } else if (act === 'del') {
        if (!confirm('¿Eliminar a ' + c.name + '? Sus facturas anteriores se conservan.')) return;
        try {
          await AKS.db().collection('clients').doc(c.id).delete();
          await load(true);
          render();
        } catch (e) { alert('No se pudo eliminar: ' + e.message); }
      }
    });
  }

  async function open() {
    try { await load(true); render(); } catch (e) {
      $('aksCl-list').innerHTML = '<span class="aks-bad">' + AKS.esc(e.message) + '</span>';
    }
  }

  AKS.init(function () {
    root = AKS.addSection('clientes', html());
    if (!root) return;
    bind();
    AKS.addMenuItem('Clientes', 'clientes', open, 'clientes');
  });

  AKS.clientes = { load: load, search: search, findByDoc: findByDoc, ensure: ensure,
    normDoc: normDoc, fmtDoc: fmtDoc, getList: function () { return list; } };
})();
