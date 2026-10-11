// assets/js/auth-client.js
// Autenticación real de clientes con Firebase Auth (modular)
// + Soporte para invitados con Anonymous Auth

import {
  initializeApp, getApps, getApp
}
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc
}
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInAnonymously,
  signOut,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail
}
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAU77yzh7Tm3RPuuvVcxlCt26u2ljmsBK0",
  authDomain: "akiramotors-cc498.firebaseapp.com",
  projectId: "akiramotors-cc498",
  storageBucket: "akiramotors-cc498.firebasestorage.app",
  messagingSenderId: "657064466850",
  appId: "1:657064466850:web:2d1340db67f790d11ebafb"
};

const app = getApps().length > 0
  ? getApp()
  : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ============================================================
// NORMALIZACIÓN DE TELÉFONO (B4)
// Acepta 0414..., +58..., 414..., con espacios o guiones
// Devuelve 58XXXXXXXXXX o lanza si no es válido
// ============================================================
export function normalizarTelefono(tel) {
  if (!tel) return '';
  let limpio = String(tel).replace(/\D/g, '');
  if (limpio.startsWith('58')) {
    // ya tiene 58
  } else if (limpio.startsWith('0')) {
    limpio = '58' + limpio.substring(1);
  } else if (limpio.length === 10) {
    limpio = '58' + limpio;
  }
  if (limpio.length < 12 || limpio.length > 13) {
    const err = new Error('Teléfono inválido');
    err.code = 'invalid-phone';
    throw err;
  }
  return limpio;
}

// ============================================================
// VERIFICAR SI UN TELÉFONO YA EXISTE
// ============================================================
export async function telefonoExiste(phone) {
  try {
    const normalizado = normalizarTelefono(phone);
    const snap = await getDoc(
      doc(db, 'phones', normalizado)
    );
    return snap.exists();
  } catch (e) {
    if (e.code === 'invalid-phone') return false;
    console.error('Error verificando teléfono:', e);
    return false;
  }
}

// ============================================================
// REGISTRO DE CLIENTE
// ============================================================
export async function registrarCliente(
  name, email, password, phone
) {
  const telefonoNorm = normalizarTelefono(phone);
  const existe = await telefonoExiste(telefonoNorm);
  if (existe) {
    const err = new Error(
      'Este teléfono ya está registrado'
    );
    err.code = 'phone-taken';
    throw err;
  }

  const cred = await createUserWithEmailAndPassword(
    auth, email, password
  );
  const uid = cred.user.uid;

  const customerCode = 'AM-' + Math.random()
    .toString(36).substr(2, 6).toUpperCase();

  const userData = {
    name: name,
    email: email,
    phone: telefonoNorm,
    customerCode: customerCode,
    createdAt: new Date().toISOString()
  };

  await setDoc(doc(db, 'users', uid), userData);
  await setDoc(doc(db, 'phones', telefonoNorm), {
    uid: uid,
    createdAt: new Date().toISOString()
  });

  try {
    await sendEmailVerification(cred.user);
  } catch (e) {
    console.error('Error enviando verificación:', e);
  }

  return {
    uid: uid,
    email: email,
    name: name,
    phone: telefonoNorm,
    customerCode: customerCode,
    emailVerified: false,
    isAnonymous: false
  };
}

// ============================================================
// LOGIN DE CLIENTE
// ============================================================
export async function loginCliente(email, password) {
  const cred = await signInWithEmailAndPassword(
    auth, email, password
  );
  const uid = cred.user.uid;

  // B1: reintentos por si el doc users aún no existe
  let snap = null;
  for (let intento = 0; intento < 5; intento++) {
    snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) break;
    await new Promise(r => setTimeout(r, 300));
  }

  if (!snap || !snap.exists()) {
    const err = new Error(
      'Cuenta sin datos. Contacta soporte.'
    );
    err.code = 'no-user-data';
    throw err;
  }

  const data = snap.data();
  return {
    uid: uid,
    email: cred.user.email,
    name: data.name || '',
    phone: data.phone || '',
    customerCode: data.customerCode || '',
    emailVerified: cred.user.emailVerified,
    isAnonymous: false
  };
}

// ============================================================
// LOGIN ANÓNIMO (invitado)
// ============================================================
export async function loginAnonimo() {
  const cred = await signInAnonymously(auth);
  return {
    uid: cred.user.uid,
    email: null,
    name: '',
    phone: '',
    customerCode: '',
    emailVerified: false,
    isAnonymous: true
  };
}

// ============================================================
// LOGOUT
// ============================================================
export async function logoutCliente() {
  await signOut(auth);
}

// ============================================================
// REENVIAR VERIFICACIÓN
// ============================================================
export async function reenviarVerificacion() {
  if (auth.currentUser && !auth.currentUser.isAnonymous) {
    await sendEmailVerification(auth.currentUser);
  }
}

// ============================================================
// RECUPERAR CONTRASEÑA
// ============================================================
export async function recuperarPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

// ============================================================
// ESCUCHAR SESIÓN (B1, B2, B3)
// ============================================================
export function escucharSesion(callback) {
  onAuthStateChanged(auth, async function(user) {
    if (!user) {
      callback(null);
      return;
    }

    // Invitado: no hay doc en users, devolvemos datos mínimos
    if (user.isAnonymous) {
      callback({
        uid: user.uid,
        email: null,
        name: '',
        phone: '',
        customerCode: '',
        emailVerified: false,
        isAnonymous: true
      });
      return;
    }

    // Usuario registrado: reintentar por si el doc aún no existe
    let snap = null;
    for (let intento = 0; intento < 5; intento++) {
      try {
        snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) break;
      } catch (e) {
        console.error('Error leyendo users:', e);
      }
      await new Promise(r => setTimeout(r, 300));
    }

    if (snap && snap.exists()) {
      const data = snap.data();
      callback({
        uid: user.uid,
        email: user.email,
        name: data.name || '',
        phone: data.phone || '',
        customerCode: data.customerCode || '',
        emailVerified: user.emailVerified,
        isAnonymous: false
      });
    } else {
      // Sesión creada pero doc no disponible: devolvemos
      // la sesión mínima en vez de "cerrar sesión"
      callback({
        uid: user.uid,
        email: user.email,
        name: '',
        phone: '',
        customerCode: '',
        emailVerified: user.emailVerified,
        isAnonymous: false
      });
    }
  });
}

// ============================================================
// REFRESCAR VERIFICACIÓN (B2)
// ============================================================
export async function refrescarVerificacion() {
  if (!auth.currentUser) return false;
  await auth.currentUser.reload();
  return auth.currentUser.emailVerified;
}

// ============================================================
// OBTENER USUARIO ACTUAL (helper)
// ============================================================
export function getUsuarioActual() {
  const u = auth.currentUser;
  if (!u) return null;
  return {
    uid: u.uid,
    email: u.email,
    emailVerified: u.emailVerified,
    isAnonymous: u.isAnonymous
  };
}
