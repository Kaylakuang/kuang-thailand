import {
  auth,
  db,
  googleProvider,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "./firebase.js";
import {
  $,
  renderSiteHeader,
  renderSiteFooter,
  showToast,
  escapeHTML
} from "./utils.js?v=202607242329";
import { updateCartCount } from "./cart.js";

let currentUser = null;
let currentProfile = null;
let authReadyPromise = null;

export function initSiteChrome(active = "") {
  renderSiteHeader(active);
  renderSiteFooter();
  updateCartCount();
  if (localStorage.getItem("kt-auth-signed-in") === "1") {
    hideAuthNavLink();
  }
  bindAuthChrome();
}

function bindAuthChrome() {
  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (user) updateAuthLinks(user, null);
    try {
      currentProfile = user ? await ensureUserProfile(user) : null;
    } catch (error) {
      console.warn("Unable to load user profile.", error);
      currentProfile = null;
    }
    updateAuthLinks(user, currentProfile);
  });
}

function updateAuthLinks(user, profile) {
  const navAuth = document.querySelector('[data-nav-key="auth"]');
  const iconLink = $(".auth-icon-link");
  if (user) {
    localStorage.setItem("kt-auth-signed-in", "1");
    hideAuthNavLink(navAuth);
    if (iconLink) iconLink.href = "my-orders.html";
  } else {
    localStorage.removeItem("kt-auth-signed-in");
    if (navAuth) {
      navAuth.hidden = false;
      navAuth.classList.remove("is-hidden");
      navAuth.textContent = "登入／註冊";
      navAuth.href = "login.html";
    }
    if (iconLink) iconLink.href = "login.html";
  }
}

function hideAuthNavLink(target = document.querySelector('[data-nav-key="auth"]')) {
  if (!target) return;
  target.hidden = true;
  target.classList.add("is-hidden");
  target.textContent = "";
  target.href = "my-orders.html";
}

export function waitForAuth() {
  if (!authReadyPromise) {
    authReadyPromise = new Promise((resolve) => {
      onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        try {
          currentProfile = user ? await ensureUserProfile(user) : null;
        } catch (error) {
          console.warn("Unable to load user profile.", error);
          currentProfile = null;
        }
        resolve({ user: currentUser, profile: currentProfile });
      });
    });
  }
  return authReadyPromise;
}

export async function requireAuth(redirectTo = "login.html") {
  const state = await waitForAuth();
  if (!state.user) {
    const next = encodeURIComponent(`${window.location.pathname.split("/").pop()}${window.location.search}`);
    window.location.href = `${redirectTo}?next=${next}`;
    return null;
  }
  return state;
}

export async function getUserProfile(uid) {
  const snapshot = await getDoc(doc(db, "users", uid));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function ensureUserProfile(user, extra = {}) {
  if (!user) return null;
  const ref = doc(db, "users", user.uid);
  const snapshot = await getDoc(ref);
  const base = {
    name: extra.name || user.displayName || "",
    email: user.email || extra.email || "",
    phone: extra.phone || "",
    lineName: extra.lineName || "",
    deliveryPreference: extra.deliveryPreference || "",
    address: extra.address || "",
    store: extra.store || "",
    pointsBalance: 0,
    pointsUpdatedAt: serverTimestamp(),
    role: "customer",
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp()
  };

  if (snapshot.exists()) {
    const existing = snapshot.data();
    const pointsPatch = typeof existing.pointsBalance === "number"
      ? {}
      : { pointsBalance: 0, pointsUpdatedAt: serverTimestamp() };
    await setDoc(ref, {
      email: user.email || existing.email || "",
      name: existing.name || base.name,
      ...pointsPatch,
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp()
    }, { merge: true });
    return {
      ...existing,
      pointsBalance: typeof existing.pointsBalance === "number" ? existing.pointsBalance : 0,
      email: user.email || existing.email || "",
      name: existing.name || base.name
    };
  }

  await setDoc(ref, {
    ...base,
    createdAt: serverTimestamp()
  }, { merge: true });
  return base;
}

function redirectAfterAuth() {
  const next = new URLSearchParams(window.location.search).get("next");
  window.location.href = next || "index.html";
}

export function initLoginPage() {
  const form = $("#login-form");
  const googleButton = $("#google-login");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = $("#login-email").value.trim();
    const password = $("#login-password").value;
    try {
      await signInWithEmailAndPassword(auth, email, password);
      showToast("登入成功");
      redirectAfterAuth();
    } catch (error) {
      showToast(getAuthErrorMessage(error));
    }
  });

  googleButton?.addEventListener("click", async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await ensureUserProfile(result.user);
      showToast("Google 登入成功");
      redirectAfterAuth();
    } catch (error) {
      showToast(getAuthErrorMessage(error));
    }
  });
}

export function initRegisterPage() {
  const form = $("#register-form");
  const googleButton = $("#google-register");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = $("#register-name").value.trim();
    const email = $("#register-email").value.trim();
    const password = $("#register-password").value;
    const phone = $("#register-phone").value.trim();
    const lineName = $("#register-line").value.trim();

    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(credential.user, { displayName: name });
      await ensureUserProfile(credential.user, { name, phone, lineName });
      showToast("註冊成功");
      redirectAfterAuth();
    } catch (error) {
      showToast(getAuthErrorMessage(error));
    }
  });

  googleButton?.addEventListener("click", async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await ensureUserProfile(result.user);
      showToast("Google 註冊成功");
      redirectAfterAuth();
    } catch (error) {
      showToast(getAuthErrorMessage(error));
    }
  });
}

export function initForgotPasswordPage() {
  const form = $("#forgot-form");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = $("#forgot-email").value.trim();
    try {
      await sendPasswordResetEmail(auth, email);
      showToast("重設密碼信已寄出");
    } catch (error) {
      showToast(getAuthErrorMessage(error));
    }
  });
}

export function bindLogoutButton(selector = "[data-logout]") {
  document.querySelectorAll(selector).forEach((button) => {
    button.addEventListener("click", async () => {
      await signOut(auth);
      showToast("已登出");
      window.location.href = "index.html";
    });
  });
}

export function getAuthErrorMessage(error) {
  const code = error?.code || "";
  if (code.includes("unauthorized-domain")) return "此網域尚未加入 Firebase Authorized domains。";
  if (code.includes("invalid-credential") || code.includes("wrong-password")) return "Email 或密碼不正確。";
  if (code.includes("email-already-in-use")) return "這個 Email 已經註冊。";
  if (code.includes("weak-password")) return "密碼至少需要 6 個字元。";
  if (code.includes("popup-closed-by-user")) return "Google 登入視窗已關閉。";
  return "操作失敗，請稍後再試。";
}

export function getCurrentUser() {
  return currentUser;
}

export function getCurrentProfile() {
  return currentProfile;
}
