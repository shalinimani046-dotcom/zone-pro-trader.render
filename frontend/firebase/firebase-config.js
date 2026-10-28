import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Default configuration for Firebase project: zoneprotrader-90959
const defaultFirebaseConfig = {
  apiKey: "AIzaSyCYqzOemfWzGVCt3juP83Sqo63ZUlxBzrU", // Replace with your Web App API Key
  authDomain: "zoneprotrader-90959.firebaseapp.com",
  databaseURL: "https://zoneprotrader-90959-default-rtdb.firebaseio.com",
  projectId: "zoneprotrader-90959",
  storageBucket: "zoneprotrader-90959.firebasestorage.app",
  messagingSenderId: "454539632936", // Replace with your messagingSenderId
  appId: "1:454539632936:web:cafe90cefbccc28f12b01d" // Replace with your appId
};

export const firebaseConfig = defaultFirebaseConfig;

// Initialize Firebase App
export const app = initializeApp(firebaseConfig);

// Initialize Firebase Auth
export const auth = getAuth(app);

// Initialize Cloud Firestore
export const db = getFirestore(app);