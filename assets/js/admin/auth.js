import { auth, db } from '../firebase.js';

async function isAdminUser(uid) {
  try {
    const snap = await db.collection('admins').doc(uid).get();
    if (!snap.exists) return { ok: false, reason: 'no-doc', uid };
    const data = snap.data();
    const flag = data.isAdmin;
    const isTrue = flag === true || flag === 'true';
    return { ok: isTrue, reason: isTrue ? 'ok' : 'flag-false', uid, flag };
  } catch (e) {
    return { ok: false, reason: 'query-error', uid, error: e.message };
  }
}

export async function loginAdmin(email, password) {
  const cred = await auth.signInWithEmailAndPassword(email, password);
  const uid = cred.user.uid;
  const check = await isAdminUser(uid);
  if (!check.ok) {
    await auth.signOut();
    const err = new Error('No autorizado');
    err.code = 'not-admin';
    err.uid = uid;
    err.reason = check.reason;
    err.flag = check.flag;
    err.error = check.error;
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