// assets/js/admin/auth.js
// Autenticación real con Firebase Auth + verificación de rol admin.

import { auth, db } from '../firebase.js';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Verifica que un usuario esté en la colección admins
async function isAdminUser(uid) {
  try {
    const snap = await getDoc(doc(db, 'admins', uid));
    return snap.exists() && snap.data().isAdmin === true;
  } catch (e) {
    console.error('Error verificando admin:', e);
    return false;
  }
}

// Login con email/password
export async function loginAdmin(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const ok = await isAdminUser(cred.user.uid);
  if (!ok) {
    await signOut(auth);
    const err = new Error('Esta cuenta no tiene permisos de administrador.');
    err.code = 'not-admin';
    throw err;
  }
  return cred.user;
}

// Logout
export async function logoutAdmin() {
  await signOut(auth);
}

// Guard: al cargar la página verifica que sea admin. Si no, redirige.
export function requireAdmin(onReady) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.replace('index.html');
      return;
    }
    const ok = await isAdminUser(user.uid);
    if (!ok) {
      await signOut(auth);
      window.location.replace('index.html');
      return;
    }
    onReady(user);
  });
}