const firebaseConfig = {
  projectId: "aura-print-pro",
  storageBucket: "aura-print-pro.firebasestorage.app"
};
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const storage = firebase.storage();
