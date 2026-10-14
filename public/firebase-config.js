/**
 * AURA PRINT PRO — FIREBASE CLIENT CONFIGURATION
 * File: public/firebase-config.js
 * Project: aura-print-pro
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

export const firebaseConfig = {
  apiKey: "AIzaSyD9ncLkKqqwGYOsk86d6CTtj8W2Kpw8eTI",
  authDomain: "aura-print-pro.firebaseapp.com",
  projectId: "aura-print-pro",
  storageBucket: "aura-print-pro.firebasestorage.app",
  messagingSenderId: "108389437934",
  appId: "1:108389437934:web:1493c88d711608cdbdfeff"
};

// Initialize Firebase SDK instances
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
