// Copy this file to firebase-config.js and paste your own values from
// Firebase console > Project settings > Your apps > website (SETUP.md, step 1).
// These values are safe to publish: security comes from firestore.rules, not from hiding the key.
export const firebaseConfig = {
    apiKey: "AIzaSyD7ZZek8IioN-f9IGVmoqikIMP96SqF1wA",
    authDomain: "reimagine-website.firebaseapp.com",
    projectId: "reimagine-website",
    storageBucket: "reimagine-website.firebasestorage.app",
    messagingSenderId: "390701801903",
    appId: "1:390701801903:web:ba294695649d880716cf5a",
    measurementId: "G-124VQJF1N4"
  };

// Stays false until the values above are replaced, so the site keeps showing the events written in the HTML.
export const configured = !Object.values(firebaseConfig).some((v) => String(v).startsWith('PASTE'));