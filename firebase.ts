import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyAP5EtHKE0jBF0wCflKp0ORtdV0C3kadAk",
  authDomain: "chat-with-pdf-7885c.firebaseapp.com",
  projectId: "chat-with-pdf-7885c",
  storageBucket: "chat-with-pdf-7885c.appspot.com",
  messagingSenderId: "887612641082",
  appId: "1:887612641082:web:0cafc0d0138c95237dca03",
};

// Check Initialize APP
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Connect to DB
const db = getFirestore(app);
const storage = getStorage(app);

export { db, storage };
