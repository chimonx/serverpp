const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');

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
const app = initializeApp(firebaseConfig);
console.log("Firebase initialized successfully");

// ทดสอบการเชื่อมต่อกับ Firestore
const db = getFirestore(app);

(async () => {
  try {
    const testCollection = collection(db, "test");
    const snapshot = await getDocs(testCollection);
    console.log(
      `Connected to Firestore successfully. Found ${snapshot.size} documents in the 'test' collection.`
    );
  } catch (error) {
    console.error("Error connecting to Firestore:", error);
  }
})();

module.exports = db;
