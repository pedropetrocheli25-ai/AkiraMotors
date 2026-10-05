// assets/js/admin/auth.js
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
    const err = new Error('Esta cuenta no tiene permisos.');
    err.code = 'not-admin';
    throw err;
  }
  return cred.user;
}

export async function logoutAdmin() {
  await auth.signOut();
}

export function setupAuthGuard(onLogin) {
  auth.onAuthStateChanged(async (user) => {
    const loginScreen = document.getElementById('loginScreen');
    const adminPanel = document.getElementById('adminPanel');

    if (!user) {
      if (loginScreen) loginScreen.style.display = 'block';
      if (adminPanel) adminPanel.classList.add('hidden');
      return;
    }

    const ok = await isAdminUser(user.uid);
    if (!ok) {
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