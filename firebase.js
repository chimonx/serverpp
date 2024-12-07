const firebase = require('firebase/app');
require('firebase/firestore'); // นำเข้า Firestore

// โหลดค่าคอนฟิกจาก Environment Variables
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
};

// ตรวจสอบว่า Firebase ถูก initialize หรือยัง
try {
  if (!firebase.apps || !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
    console.log("Firebase initialized successfully");
  }
} catch (error) {
  console.error("Firebase initialization error:", error);
}

// ทดสอบการเชื่อมต่อกับ Firestore
const db = firebase.firestore();

db.collection("test")
  .get()
  .then((snapshot) => {
    console.log(
      `Connected to Firestore successfully. Found ${snapshot.size} documents in the 'test' collection.`
    );
  })
  .catch((error) => {
    console.error("Error connecting to Firestore:", error);
  });

module.exports = db;
