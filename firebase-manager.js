// ==========================================
// FIREBASE CONFIGURATION
// ==========================================
// TODO: Replace this with your actual Firebase config!
// 1. Go to console.firebase.google.com
// 2. Create a new project or open an existing one
// 3. Click the gear icon > Project settings
// 4. Scroll down to "Your apps" and add a Web App (</>)
// 5. Copy the config object and paste it below
const firebaseConfig = {
  apiKey: "AIzaSyBGNLjdD9610NbkbAmQfJB6g8a2zkXRrkY",
  authDomain: "workflow-cfe32.firebaseapp.com",
  projectId: "workflow-cfe32",
  storageBucket: "workflow-cfe32.firebasestorage.app",
  messagingSenderId: "29625530290",
  appId: "1:29625530290:web:601c02f54f51006a0ed6ab",
  measurementId: "G-FCWXJS1L4G"
};

// Initialize Firebase
let app, auth, db;
const isValidConfig = true;

if (isValidConfig) {
    try {
        app = firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();
    } catch (err) {
        console.error("Firebase Init Error", err);
    }
} else {
    console.warn("Firebase config is missing. Please update firebase-manager.js with your config.");
}

// State
window.currentUser = null;
let isLoginMode = true;

// DOM Elements
const loginOverlay = document.getElementById('login-overlay');
const authForm = document.getElementById('auth-form');
const emailInput = document.getElementById('auth-email');
const passwordInput = document.getElementById('auth-password');
const submitBtn = document.getElementById('auth-submit-btn');
const toggleModeBtn = document.getElementById('auth-toggle-mode');
const googleLoginBtn = document.getElementById('google-login-btn');
const desktopLogoutBtn = document.getElementById('desktop-logout-btn');
const mobileLogoutBtn = document.getElementById('mobile-logout-btn');

// Toggle Login / Signup Mode
if (toggleModeBtn) {
    toggleModeBtn.addEventListener('click', () => {
        isLoginMode = !isLoginMode;
        if (isLoginMode) {
            submitBtn.textContent = 'Sign In';
            toggleModeBtn.textContent = "Don't have an account? Sign Up";
        } else {
            submitBtn.textContent = 'Sign Up';
            toggleModeBtn.textContent = "Already have an account? Sign In";
        }
    });
}

// Authentication Handlers
if (authForm) {
    authForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!isValidConfig) return alert("Please configure Firebase in firebase-manager.js first!");

        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();

        if (isLoginMode) {
            auth.signInWithEmailAndPassword(email, password)
                .catch(err => alert("Login failed: " + err.message));
        } else {
            auth.createUserWithEmailAndPassword(email, password)
                .catch(err => alert("Signup failed: " + err.message));
        }
    });
}

if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', () => {
        if (!isValidConfig) return alert("Please configure Firebase in firebase-manager.js first! Also ensure Google Sign-In is enabled in Firebase Authentication.");
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(err => alert("Google Login failed: " + err.message));
    });
}

if (desktopLogoutBtn) {
    desktopLogoutBtn.addEventListener('click', () => {
        if (auth) auth.signOut();
    });
}
if (mobileLogoutBtn) {
    mobileLogoutBtn.addEventListener('click', () => {
        if (auth) auth.signOut();
    });
}

// Auth State Observer
if (auth) {
    auth.onAuthStateChanged((user) => {
        if (user) {
            window.currentUser = user;
            if (loginOverlay) loginOverlay.style.display = 'none';
            
            // Setup Real-time Sync
            setupRealtimeSync();
        } else {
            window.currentUser = null;
            if (loginOverlay) loginOverlay.style.display = 'flex';
        }
    });
}

// Firestore Sync Functions
async function syncToFirebase(localData) {
    if (!db || !window.currentUser) return;
    try {
        const currentBudget = localStorage.getItem('WorkflowBudget') || 500;
        await db.collection("users").doc(window.currentUser.uid).set({
            workData: JSON.stringify(localData),
            budget: currentBudget,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    } catch (err) {
        console.error("Error syncing to Firebase", err);
    }
}

let unsubscribeSnapshot = null;

function setupRealtimeSync() {
    if (!db || !window.currentUser) return;
    
    if (unsubscribeSnapshot) unsubscribeSnapshot();

    unsubscribeSnapshot = db.collection("users").doc(window.currentUser.uid).onSnapshot((doc) => {
        if (doc.exists) {
            const data = doc.data();
            let needsRender = false;
            
            if (data.workData) {
                const remoteDataStr = data.workData;
                if (localStorage.getItem('WorkflowData') !== remoteDataStr) {
                    localStorage.setItem('WorkflowData', remoteDataStr);
                    window.workData = JSON.parse(remoteDataStr);
                    needsRender = true;
                }
            }
            
            if (data.budget) {
                if (localStorage.getItem('WorkflowBudget') != data.budget) {
                    localStorage.setItem('WorkflowBudget', data.budget);
                    needsRender = true;
                }
            }
            
            if (needsRender && typeof renderCurrentView === 'function') {
                renderCurrentView();
                if (typeof updateProgressRing === 'function') updateProgressRing();
            }
        }
    }, (err) => {
        console.error("Realtime sync failed:", err);
    });
}
