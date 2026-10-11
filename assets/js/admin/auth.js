// assets/js/admin/auth.js
// Autenticación de administradores

import { auth, db } from '../firebase.js';

// ============================================================
// VERIFICAR SI UN UID ES ADMIN
// A8: acepta SOLO boolean true (no strings)
// ============================================================
async function isAdminUser(uid) {
  try {
    const snap = await db.collection('admins').doc(uid).get();
    if (!snap.exists) {
      return { ok: false, reason: 'no-doc' };
    }
    const data = snap.data();
    const isTrue = data.isAdmin === true;
    return {
      ok: isTrue,
      reason: isTrue ? 'ok' : 'flag-false'
    };
  } catch (e) {
    return { ok: false, reason: 'query-error' };
  }
}

// ============================================================
// LOGIN ADMIN
// ============================================================
export async function loginAdmin(email, password) {
  const cred = await auth.signInWithEmailAndPassword(
    email, password
  );
  const uid = cred.user.uid;
  const check = await isAdminUser(uid);
  if (!check.ok) {
    await auth.signOut();
    const err = new Error('No autorizado');
    err.code = 'not-admin';
    throw err;
  }
  return cred.user;
}

// ============================================================
// LOGOUT ADMIN
// ============================================================
export async function logoutAdmin() {
  await auth.signOut();
}

// ============================================================
// GUARD DE AUTENTICACIÓN
// ============================================================
export function setupAuthGuard(onLogin) {
  auth.onAuthStateChanged(async (user) => {
    const loginScreen = document.getElementById('loginScreen');
    const adminPanel = document.getElementById('adminPanel');

    if (!user) {
      if (loginScreen) loginScreen.style.display = 'block';
      if (adminPanel) adminPanel.classList.add('hidden');
      return;
    }

    const check = await isAdminUser(user.uid);
    if (!check.ok) {
      await auth.signOut();
      if (loginScreen) loginScreen.style.display = 'block';
      if (adminPanel) adminPanel.classList.add('hidden');
      return;
    }

    if (loginScreen) loginScreen.style.display = 'none';
    if (adminPanel) {
      adminPanel.classList.remove('hidden');
      adminPanel.style.display = 'flex';
    }

    if (typeof onLogin === 'function') onLogin(user);
  });
}

export const requireAdmin = setupAuthGuard;
