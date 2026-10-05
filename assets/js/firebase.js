if (!window.firebase || !window.firebase.apps || window.firebase.apps.length === 0) {
  throw new Error('Firebase compat no está inicializado.');
}
export const app = window.firebase.app();
export const db = window.firebase.firestore();
export const auth = window.firebase.auth();