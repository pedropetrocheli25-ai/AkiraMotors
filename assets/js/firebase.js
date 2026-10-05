// assets/js/firebase.js
// Inicialización compartida de Firebase. Todos los demás módulos lo importan de aquí.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyAU77yzh7Tm3RPuuvVcxlCt26u2LjmsBK0",
  authDomain: "akiramotors-cc498.firebaseapp.com",
  projectId: "akiramotors-cc498",
  storageBucket: "akiramotors-cc498.firebasestorage.app",
  messagingSenderId: "657064466850",
  appId: "1:657064466850:web:2d1340db67f790d11ebafb"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);