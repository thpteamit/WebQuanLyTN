// Firebase Web App config
// 1) Vào Firebase Console -> Project settings -> Your apps (Web) -> Firebase SDK snippet (Config)
// 2) Dán config vào đây.
// Lưu ý: apiKey/config KHÔNG phải bí mật. Bảo mật nằm ở Firebase Auth + Realtime Database Rules.

window.FIREBASE_WEB_CONFIG = {
    apiKey: "AIzaSyCycW1AcdFrCGfJEx4G8QH6o9_MNmKeDmk",
    authDomain: "quanlytnweb.firebaseapp.com",
    databaseURL: "https://quanlytnweb-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "quanlytnweb",
    storageBucket: "quanlytnweb.firebasestorage.app",
    messagingSenderId: "123741063676",
    appId: "1:123741063676:web:488da88f1da2877a1a0a79",
    measurementId: "G-C3GDJCWVQ6"
};

// If users log in with "tài khoản" (username) instead of email, we map:
// username -> `${username}@${FIREBASE_USERNAME_EMAIL_DOMAIN}`
// Domain does NOT need to exist; it's just an identifier for Firebase Email/Password.
window.FIREBASE_USERNAME_EMAIL_DOMAIN = 'users.quanlytn.local';

// Role mapping is stored in Realtime Database at: /userRoles/{uid} => "admin" | "download"
// Bạn có thể tạo thủ công 2 bản ghi role trong Firebase Console để chạy ngay.
