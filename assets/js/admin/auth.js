// assets/js/admin/auth.js
// Autenticación real con Firebase Auth (modo compat) + verificación de admin.

import { auth, db } from '../firebase.js';

async function isAdminUser(uid) {
  const snap = await db.collection('admins').doc(uid).get();
  return snap.exists && snap.data().isAdmin === true;
}

export async function loginAdmin(email, password) {
  const cred = await auth.signInWithEmailAndPassword(email, password);
  const ok = await isAdminUser(cred.user.uid);
  if (!ok) {
    await auth.signOut();
    const err = new Error('Esta cuenta no tiene permisos de administrador.');
    err.code = 'not-admin';
    throw err;
  }
  return cred.user;
}

export async function logoutAdmin() {
  await auth.signOut();
}

export function requireAdmin(onReady) {
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.replace('index.html');
      return;
    }
    try {
      const ok = await isAdminUser(user.uid);
      if (!ok) {
        await auth.signOut();
        window.location.replace('index.html');
        return;
      }
      onReady(user);
    } catch (e) {
      console.error('Error verificando admin:', e);
      window.location.replace('index.html');
    }
  });
}