// assets/js/auth-client.js
// Autenticación real de clientes con Firebase Auth (modular)

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

export async function telefonoExiste(phone) {
  try {
    const snap = await getDoc(doc(db, 'phones', phone));
    return snap.exists();
  } catch (e) {
    console.error('Error verificando teléfono:', e);
    return false;
  }
}

export async function registrarCliente(
  name, email, password, phone
) {
  const existe = await telefonoExiste(phone);
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
    phone: phone,
    customerCode: customerCode,
    createdAt: new Date().toISOString()
  };

  await setDoc(doc(db, 'users', uid), userData);
  await setDoc(doc(db, 'phones', phone), {
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
    phone: phone,
    customerCode: customerCode,
    emailVerified: false
  };
}

export async function loginCliente(email, password) {
  const cred = await signInWithEmailAndPassword(
    auth, email, password
  );
  const uid = cred.user.uid;
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) {
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
    emailVerified: cred.user.emailVerified
  };
}

export async function logoutCliente() {
  await signOut(auth);
}

export async function reenviarVerificacion() {
  if (auth.currentUser) {
    await sendEmailVerification(auth.currentUser);
  }
}

export async function recuperarPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

export function escucharSesion(callback) {
  onAuthStateChanged(auth, async function(user) {
    if (!user) {
      callback(null);
      return;
    }
    try {
      const snap = await getDoc(
        doc(db, 'users', user.uid)
      );
      if (snap.exists()) {
        const data = snap.data();
        callback({
          uid: user.uid,
          email: user.email,
          name: data.name || '',
          phone: data.phone || '',
          customerCode: data.customerCode || '',
          emailVerified: user.emailVerified
        });
      } else {
        callback(null);
      }
    } catch (e) {
      console.error('Error recuperando sesión:', e);
      callback(null);
    }
  });
}

export async function refrescarVerificacion() {
  if (!auth.currentUser) return false;
  await auth.currentUser.reload();
  return auth.currentUser.emailVerified;
}