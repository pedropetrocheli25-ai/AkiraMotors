// assets/js/firebase.js
// Usa la misma instancia de Firebase que el script compat del HTML.

if (!window.firebase || !window.firebase.apps || window.firebase.apps.length === 0) {
  throw new Error('Firebase compat no está inicializado. Verifica que los scripts de compat estén cargados antes.');
}

export const app = window.firebase.app();
export const db = window.firebase.firestore();
export const auth = window.firebase.auth();