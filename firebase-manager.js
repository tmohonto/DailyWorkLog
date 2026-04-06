// ==========================================
// CONFIGURATION RESOLVER
// ==========================================
const firebaseConfig = window.CONFIG?.FIREBASE || {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
  measurementId: ""
};

// Initialize Google Sheet settings
const DEFAULT_SPREADSHEET_ID = window.CONFIG?.GOOGLE_SHEETS?.DEFAULT_SPREADSHEET_ID || "";
let SPREADSHEET_ID = localStorage.getItem('Workflow_Sheet_ID') || DEFAULT_SPREADSHEET_ID;
let SHEET_NAME_OVERRIDE = localStorage.getItem('Workflow_Sheet_Name');
let gapiInitialized = false;
let googleAccessToken = sessionStorage.getItem('googleAccessToken');

// Auto-init GAPI when the script is loaded
window.addEventListener('load', () => {
    if (googleAccessToken) {
        setTimeout(() => initGapi(), 1000);
    }
});

// Initialize Firebase automatically if a real API Key is provided
let app, auth, db;
const isValidConfig = firebaseConfig.apiKey && firebaseConfig.apiKey.startsWith("AIza");

if (isValidConfig) {
    try {
        app = firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();
    } catch (err) {
        console.error("Firebase Init Error", err);
    }
} else {
    console.warn("Firebase configuration is not fully ready. Logic will be limited.");
}

function updateSheetSettings(newId, newName) {
    if (newId) {
        // Extract ID if a full URL was pasted
        if (newId.includes("/d/")) {
            newId = newId.split("/d/")[1].split("/")[0];
        }
        SPREADSHEET_ID = newId;
        localStorage.setItem('Workflow_Sheet_ID', newId);
    }
    SHEET_NAME_OVERRIDE = newName;
    if (newName) {
        localStorage.setItem('Workflow_Sheet_Name', newName);
    } else {
        localStorage.removeItem('Workflow_Sheet_Name');
    }
    console.log("Sheet settings updated:", SPREADSHEET_ID, SHEET_NAME_OVERRIDE);
}

function getDynamicSheetName(dateStr) {
    if (SHEET_NAME_OVERRIDE && SHEET_NAME_OVERRIDE.trim() !== "") return SHEET_NAME_OVERRIDE;
    
    const d = new Date(dateStr);
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const monthName = months[d.getMonth()];
    const year = d.getFullYear();
    return `${monthName} ${year} Transactions`;
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
        provider.addScope('https://www.googleapis.com/auth/spreadsheets');
        auth.signInWithPopup(provider)
            .then((result) => {
                googleAccessToken = result.credential.accessToken;
                sessionStorage.setItem('googleAccessToken', googleAccessToken);
                initGapi();
            })
            .catch(err => alert("Google Login failed: " + err.message));
    });
}

if (desktopLogoutBtn) {
    desktopLogoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem('googleAccessToken'); // Clear token on logout
        if (auth) auth.signOut();
    });
}
if (mobileLogoutBtn) {
    mobileLogoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem('googleAccessToken'); // Clear token on logout
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

// ==========================================
// GOOGLE SHEETS INTEGRATION (DIRECT FETCH)
// ==========================================

function initGapi() {
    if (googleAccessToken) {
        gapiInitialized = true;
        console.log("🟢 Sheets Sync ready via Direct Access");
        showSyncStatus("🟢 Google Sheets connected", "success");
    } else {
        console.warn("🟡 No Google Access Token found.");
    }
}

function showSyncStatus(msg, type) {
    let el = document.getElementById('sync-status-toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'sync-status-toast';
        el.style.cssText = 'position: fixed; bottom: 85px; right: 20px; padding: 10px 15px; border-radius: 12px; font-size: 0.85rem; font-weight: 600; z-index: 9999; backdrop-filter: blur(10px); transition: opacity 0.5s; opacity: 0; pointer-events: none; border: 1px solid rgba(255,255,255,0.1);';
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.background = type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';
    el.style.color = type === 'success' ? '#10b981' : '#ef4444';
    el.style.opacity = 1;
    setTimeout(() => { el.style.opacity = 0; }, 4000);
}

async function appendExpenseToSheet(date, amount, description, category) {
    if (!googleAccessToken) {
        if (amount > 0) {
            alert("⚠️ Google Sheets Connection Needed!\n\nPlease click 'Logout' and then sign in using the 'Continue with Google' button to activate the sync.");
            showSyncStatus("🔴 No Google Connection", "error");
        }
        return;
    }

    try {
        console.log(`📡 Direct Sending: ${description} (৳${amount})`);
        const parts = date.split('-');
        const yyyy = parts[0];
        const mm = parseInt(parts[1]);
        const dd = parseInt(parts[2]);
        const sheetDate = `${mm}/${dd}/${yyyy}`;
        const dynamicTabName = getDynamicSheetName(date);
        
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'${dynamicTabName}'!B5:E:append?valueInputOption=USER_ENTERED`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${googleAccessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                values: [[sheetDate, `৳${amount.toFixed(2)}`, description, category]]
            })
        });

        const result = await response.json();
        if (response.ok) {
            console.log("🚀 Sync Success!", result);
            showSyncStatus("✅ Saved to Sheet", "success");
        } else {
            throw new Error(result.error ? result.error.message : "Network error");
        }
    } catch (err) {
        console.error("❌ Sync Error:", err);
        let errorMsg = err.message;
        if (errorMsg.includes("not found")) {
            errorMsg = `Tab "${getDynamicSheetName(date)}" was not found in your Google Sheet. Please create it first!`;
        }
        alert("Google Sheets Sync Failed: " + errorMsg);
        showSyncStatus("❌ Sync failed", "error");
    }
}


