// SunnyClassDrive — public file hub with admin-created username/password accounts.
// Firebase client configuration is public by design; enforce access with Auth and Firestore rules.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import {
  getFirestore, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCDWL-pjSpRid_kbafezVpbQfaKrQP1iIw",
  authDomain: "sunnyclassdrive-58e61.firebaseapp.com",
  projectId: "sunnyclassdrive-58e61",
  storageBucket: "sunnyclassdrive-58e61.firebasestorage.app",
  messagingSenderId: "1063881906992",
  appId: "1:1063881906992:web:c2bc072c0ea1d7754f06f5",
  measurementId: "G-KBMG45J2LS"
};

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  "pdf","ppt","pptx","doc","docx","xls","xlsx","txt","png","jpg","jpeg","webp"
]);

const $ = (id) => document.getElementById(id);
const fileList = $("fileList");
const toastEl = $("toast");
let allFiles = [];
let activeFilter = "all";
let db, auth, functionsClient, currentUser = null;
const SUPABASE_URL = "https://vwewwowlpaqdtutyniou.supabase.co";
const EDGE_UPLOAD_URL = SUPABASE_URL + "/functions/v1/upload-file";

function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => toastEl.classList.remove("show"), 3500);
}
function configReady() {
  return firebaseConfig.apiKey !== "PASTE_YOUR_API_KEY" &&
    firebaseConfig.projectId !== "YOUR_PROJECT_ID";
}
function extension(name) { return (name.split(".").pop() || "").toLowerCase(); }
function category(file) {
  const ext = extension(file.name);
  if (ext === "pdf") return "PDF";
  if (["ppt","pptx"].includes(ext)) return "PPT";
  if (["doc","docx","xls","xlsx","txt"].includes(ext)) return "DOC";
  if (["png","jpg","jpeg","webp"].includes(ext)) return "IMAGE";
  return "OTHER";
}
function formatSize(bytes) {
  if (!bytes) return "—";
  const units = ["B","KB","MB","GB"];
  let size = bytes, index = 0;
  while (size >= 1024 && index < units.length - 1) { size /= 1024; index++; }
  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
function formatDate(value) {
  if (!value) return "Just now";
  const date = value.toDate ? value.toDate() : new Date(value);
  return date.toLocaleDateString(undefined, { day:"numeric", month:"short", year:"numeric" });
}
function safeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[char]));
}
function renderFiles() {
  const search = $("searchInput").value.trim().toLowerCase();
  let shown = allFiles.filter(file => {
    const matchesCategory = activeFilter === "all" || category(file) === activeFilter;
    const matchesSearch = file.name.toLowerCase().includes(search);
    return matchesCategory && matchesSearch;
  });
  const sort = $("sortSelect").value;
  shown.sort((a,b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "size") return (b.size || 0) - (a.size || 0);
    const aTime = a.createdAt?.toMillis?.() || 0;
    const bTime = b.createdAt?.toMillis?.() || 0;
    return sort === "oldest" ? aTime - bTime : bTime - aTime;
  });

  $("totalFiles").textContent = allFiles.length;
  $("totalPpt").textContent = allFiles.filter(f => category(f) === "PPT").length;
  $("totalDocs").textContent = allFiles.filter(f => ["PDF","DOC"].includes(category(f))).length;
  $("allCount").textContent = allFiles.length;
  $("filesHeading").textContent = activeFilter === "all" ? "Recent files" : `${activeFilter} files`;

  if (!shown.length) {
    fileList.innerHTML = `<div class="empty-state"><div>☁</div><h3>${allFiles.length ? "No matching files" : "No files uploaded yet"}</h3><p>${allFiles.length ? "Try another search or category." : "Upload the first file to your school workspace."}</p></div>`;
    return;
  }
  fileList.innerHTML = shown.map(file => {
    const type = category(file);
    const iconClass = type === "PDF" ? "pdf" : type === "PPT" ? "ppt" : type === "DOC" ? "doc" : type === "IMAGE" ? "image" : "other";
    const icon = type === "PDF" ? "PDF" : type === "PPT" ? "PPT" : type === "DOC" ? "DOC" : type === "IMAGE" ? "IMG" : "FILE";
    return `<div class="file-row">
      <div class="file-name"><div class="file-symbol ${iconClass}">${icon}</div><div style="min-width:0"><strong title="${safeText(file.name)}">${safeText(file.name)}</strong><small>${safeText(file.originalName || file.name)}</small></div></div>
      <div class="file-meta"><span class="type-tag">${type}</span></div>
      <div class="file-meta file-size">${formatSize(file.size)}</div>
      <div class="file-meta file-date">${formatDate(file.createdAt)}</div>
      <button class="download-btn" title="Download ${safeText(file.name)}" aria-label="Download ${safeText(file.name)}" data-download="${safeText(file.downloadURL)}">↓</button>
    </div>`;
  }).join("");
}
async function uploadOne(file) {
  if (!currentUser) throw new Error("Please sign in before uploading.");
  const ext = extension(file.name);
  if (!ALLOWED_EXTENSIONS.has(ext)) throw new Error(file.name + ": file type not supported.");
  if (file.size > MAX_FILE_SIZE) throw new Error(file.name + ": larger than 25 MB.");
  if (!file.size) throw new Error(file.name + ": empty files cannot be uploaded.");
  const safeName = file.name.replace(/[^\w.\-() ]/g, "_").slice(0, 100);
  const token = await currentUser.getIdToken();
  $("uploadProgress").hidden = false;
  $("progressTitle").textContent = "Uploading " + file.name;
  $("progressDetail").textContent = "Please keep this page open.";
  $("progressPercent").textContent = "Uploading…";
  $("progressBar").style.width = "0%";
  const response = await fetch(EDGE_UPLOAD_URL, {
    method: "POST",
    headers: { "Authorization": "Bearer " + token, "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(safeName) },
    body: file
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Upload failed (" + response.status + ").");
  if (!result.path || !result.publicUrl) throw new Error("Upload service returned an incomplete response.");
  $("progressPercent").textContent = "100%";
  $("progressBar").style.width = "100%";
  await addDoc(collection(db, "schoolFiles"), { name: safeName, originalName: safeName, storagePath: result.path, downloadURL: result.publicUrl, size: file.size, contentType: file.type || "application/octet-stream", uploadedBy: currentUser.uid, createdAt: serverTimestamp() });
}
async function handleFiles(files) {
  if (!files?.length) return;
  if (!currentUser) { toast("Please sign in to upload files."); return; }
  if (!configReady()) {
    toast("First add your Firebase configuration in app.js.");
    return;
  }
  for (const file of files) {
    try {
      await uploadOne(file);
      toast(`${file.name} uploaded successfully.`);
    } catch (error) {
      console.error(error);
      toast(error.message || `Could not upload ${file.name}.`);
    }
  }
  $("uploadProgress").hidden = true;
  $("fileInput").value = "";
}

function usernameToEmail(username) {
  const normalized = String(username || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,19}$/.test(normalized)) {
    throw new Error("Username must be 3–20 characters and use only letters, numbers, dots, underscores or hyphens.");
  }
  return normalized + "@accounts.sunnyclassdrive.invalid";
}

function installAuthUI() {
  document.querySelector(".topbar").insertAdjacentHTML("afterend",
    '<section class="auth-panel" id="authPanel"></section>' +
    '<section class="auth-form" id="authForm" hidden>' +
      '<strong>Student / Admin login</strong>' +
      '<form id="usernameLoginForm">' +
        '<label>Username<input id="loginUsername" type="text" required minlength="3" maxlength="20" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="Enter your username"></label>' +
        '<label>Password<input id="loginPassword" type="password" required minlength="8" autocomplete="current-password" placeholder="Enter your password"></label>' +
        '<button class="primary-btn auth-wide" id="loginSubmit" type="submit">Sign in</button>' +
      '</form>' +
      '<p id="authMessage" aria-live="polite"></p>' +
      '<button class="auth-action" id="closeAuth" type="button">Close</button>' +
    '</section>');

  const panel = $("authPanel");
  const message = (value) => { $("authMessage").textContent = value; };

  $("usernameLoginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = $("loginUsername").value.trim().toLowerCase();
    const password = $("loginPassword").value;
    const submit = $("loginSubmit");
    submit.disabled = true;
    message("Signing in…");
    try {
      const email = usernameToEmail(username);
      await signInWithEmailAndPassword(auth, email, password);
      $("authForm").hidden = true;
      toast("Signed in successfully.");
    } catch (error) {
      console.error("Username sign-in failed:", error);
      message(error.code === "auth/too-many-requests"
        ? "Too many attempts. Please wait and try again."
        : "Invalid username or password, or this account is disabled.");
    } finally {
      submit.disabled = false;
    }
  });

  $("closeAuth").addEventListener("click", () => { $("authForm").hidden = true; });

  panel.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-admin-action], #showAuthBtn, #signOutBtn");
    if (!button) return;

    if (button.id === "showAuthBtn") {
      $("authForm").hidden = false;
      $("loginUsername").focus();
      return;
    }
    if (button.id === "signOutBtn") {
      try { await signOut(auth); toast("Signed out."); }
      catch (error) { toast(error.message || "Could not sign out."); }
      return;
    }

    const action = button.dataset.adminAction;
    const uid = button.dataset.uid;
    if (!uid) return;

    try {
      button.disabled = true;
      if (action === "toggle") {
        const disabled = button.dataset.disabled === "true";
        await httpsCallable(functionsClient, "setStudentDisabled")({ uid, disabled });
        toast(disabled ? "Student account disabled." : "Student account enabled.");
        await loadAdminStudents();
      } else if (action === "reset") {
        const password = window.prompt("Enter a new password (at least 8 characters):");
        if (password === null) return;
        await httpsCallable(functionsClient, "resetStudentPassword")({ uid, newPassword: password });
        toast("Student password updated.");
      } else if (action === "delete") {
        if (!window.confirm("Permanently delete this student account? This cannot be undone.")) return;
        await httpsCallable(functionsClient, "deleteStudentAccount")({ uid });
        toast("Student account deleted.");
        await loadAdminStudents();
      }
    } catch (error) {
      console.error(error);
      toast(error.message || "Admin action failed.");
    } finally {
      button.disabled = false;
    }
  });

  panel.addEventListener("submit", async (event) => {
    if (event.target.id !== "studentCreateForm") return;
    event.preventDefault();
    const submit = $("createStudentBtn");
    const username = $("newUsername").value.trim().toLowerCase();
    const displayName = $("newDisplayName").value.trim();
    const password = $("newStudentPassword").value;
    submit.disabled = true;
    $("adminMessage").textContent = "Creating account…";
    try {
      const result = await httpsCallable(functionsClient, "createStudentAccount")({
        username, displayName, password
      });
      $("studentCreateForm").reset();
      $("adminMessage").textContent = "Account created. Share the username and temporary password securely with the student.";
      toast("Student account created: " + result.data.username);
      await loadAdminStudents();
    } catch (error) {
      console.error(error);
      $("adminMessage").textContent = error.message || "Could not create the account.";
    } finally {
      submit.disabled = false;
    }
  });
}

async function loadAdminStudents() {
  const target = $("adminStudentList");
  if (!target || !functionsClient) return;
  target.innerHTML = '<p class="admin-muted">Loading student accounts…</p>';
  try {
    const result = await httpsCallable(functionsClient, "listStudentAccounts")({});
    const students = result.data.students || [];
    if (!students.length) {
      target.innerHTML = '<p class="admin-muted">No student accounts have been created yet.</p>';
      return;
    }
    target.innerHTML = students.map(student => {
      const status = student.active ? "Active" : "Disabled";
      const actionLabel = student.active ? "Disable" : "Enable";
      return '<div class="admin-user-row">' +
        '<div class="admin-user-info"><strong>' + safeText(student.username) + '</strong>' +
        '<small>' + safeText(student.displayName || "Student") + ' · ' + status + '</small></div>' +
        '<div class="admin-user-actions">' +
          '<button class="auth-action" type="button" data-admin-action="toggle" data-uid="' + safeText(student.uid) + '" data-disabled="' + String(student.active) + '">' + actionLabel + '</button>' +
          '<button class="auth-action" type="button" data-admin-action="reset" data-uid="' + safeText(student.uid) + '">Reset password</button>' +
          '<button class="auth-action danger-action" type="button" data-admin-action="delete" data-uid="' + safeText(student.uid) + '">Delete</button>' +
        '</div></div>';
    }).join("");
  } catch (error) {
    console.error(error);
    target.innerHTML = '<p class="admin-error">Could not load accounts. Check admin permissions and Cloud Functions deployment.</p>';
  }
}

function renderSignedInPanel(panel, user, claims) {
  const username = claims.username || user.displayName || "User";
  panel.innerHTML =
    '<div class="auth-status">Signed in as <strong>' + safeText(username) +
    (claims.role === "admin" ? ' <span class="admin-role">ADMIN</span>' : ' <span class="student-role">STUDENT</span>') +
    '</strong><button class="auth-action" id="signOutBtn" type="button">Sign out</button></div>';

  if (claims.role === "admin") {
    panel.insertAdjacentHTML("beforeend",
      '<div class="admin-tools">' +
        '<div class="admin-heading"><strong>Admin · Student accounts</strong><span>Private account management</span></div>' +
        '<form id="studentCreateForm" class="admin-create-form">' +
          '<label>Username<input id="newUsername" required minlength="3" maxlength="20" pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,19}" placeholder="e.g. student01" autocapitalize="none"></label>' +
          '<label>Student name<input id="newDisplayName" required maxlength="60" placeholder="Student name"></label>' +
          '<label>Temporary password<input id="newStudentPassword" type="password" required minlength="8" autocomplete="new-password" placeholder="At least 8 characters"></label>' +
          '<button class="primary-btn" id="createStudentBtn" type="submit">＋ Create student account</button>' +
        '</form>' +
        '<p id="adminMessage" class="admin-muted" aria-live="polite"></p>' +
        '<div class="admin-list-heading">Student accounts</div>' +
        '<div id="adminStudentList"><p class="admin-muted">Loading…</p></div>' +
      '</div>');
    loadAdminStudents();
  }
}

function connectFirebase() {
  if (!configReady()) {
    fileList.innerHTML = '<div class="empty-state"><div>☁</div><h3>Firebase setup required</h3><p>Follow SETUP.md and add your Firebase web config in app.js.</p></div>';
    $("totalFiles").textContent = "—";
    $("totalPpt").textContent = "—";
    $("totalDocs").textContent = "—";
    return;
  }
  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    functionsClient = getFunctions(app, "asia-south1");
    installAuthUI();

    onAuthStateChanged(auth, async (user) => {
      currentUser = user;
      const panel = $("authPanel");
      if (user) {
        try {
          const token = await user.getIdTokenResult();
          const claims = token.claims || {};
          if (!["admin", "student"].includes(claims.role)) {
            currentUser = null;
            await signOut(auth);
            toast("This account is not authorized for SunnyClassDrive.");
            return;
          }
          renderSignedInPanel(panel, user, claims);
          $("dropZone").hidden = false;
          $("uploadTopBtn").hidden = false;
        } catch (error) {
          console.error(error);
          toast("Could not verify account permissions.");
        }
      } else {
        panel.innerHTML = '<div class="auth-status">Sign in with the username and password provided by your administrator. Browsing and downloads remain public.<button class="auth-action" id="showAuthBtn" type="button">Sign in</button></div>';
        $("dropZone").hidden = true;
        $("uploadTopBtn").hidden = true;
      }
    });

    const filesQuery = query(collection(db, "schoolFiles"), orderBy("createdAt", "desc"));
    onSnapshot(filesQuery, snapshot => {
      allFiles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      renderFiles();
    }, error => {
      console.error(error);
      fileList.innerHTML = '<div class="empty-state"><div>⚠</div><h3>Could not load files</h3><p>Check Firestore rules and internet connection.</p></div>';
      toast("Firebase error. Check your project setup and rules.");
    });
  } catch (error) {
    console.error(error);
    toast("Firebase configuration is invalid. Check app.js.");
  }
}

$("browseBtn").addEventListener("click", () => currentUser ? $("fileInput").click() : toast("Please sign in to upload."));
$("uploadTopBtn").addEventListener("click", () => currentUser ? $("fileInput").click() : toast("Please sign in to upload."));
$("fileInput").addEventListener("change", event => handleFiles(event.target.files));
$("searchInput").addEventListener("input", renderFiles);
$("sortSelect").addEventListener("change", renderFiles);
document.querySelectorAll(".nav-item").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));
  button.classList.add("active");
  activeFilter = button.dataset.filter;
  $("breadcrumbName").textContent = button.textContent.trim().replace(/\s+\d+$/, "");
  renderFiles();
  $("sidebar").classList.remove("open");
}));
fileList.addEventListener("click", event => {
  const button = event.target.closest("[data-download]");
  if (!button) return;
  const url = button.dataset.download;
  if (!url) return toast("Download link is unavailable.");
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  link.download = "";
  document.body.appendChild(link);
  link.click();
  link.remove();
});
const dropZone = $("dropZone");
["dragenter","dragover"].forEach(name => dropZone.addEventListener(name, event => {
  event.preventDefault(); dropZone.classList.add("dragover");
}));
["dragleave","drop"].forEach(name => dropZone.addEventListener(name, event => {
  event.preventDefault(); dropZone.classList.remove("dragover");
}));
dropZone.addEventListener("drop", event => handleFiles(event.dataTransfer.files));
$("mobileMenu").addEventListener("click", () => $("sidebar").classList.toggle("open"));
const yearElement = $("year");
if (yearElement) yearElement.textContent = new Date().getFullYear();

// Progressive Web App install support.
let deferredInstallPrompt = null;
const installBtn = $("installBtn");
const installHelp = $("installHelp");

function isAppInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.navigator.standalone === true;
}

function showInstallHelp() {
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) {
    installHelp.innerHTML = 'To install on iPhone/iPad: tap the <b>Share</b> button in Safari, then choose <b>Add to Home Screen</b>.';
  } else if (/Android/i.test(ua)) {
    installHelp.innerHTML = 'If the install popup does not appear: open Chrome’s <b>⋮ menu</b> and choose <b>Install app</b> or <b>Add to Home screen</b>.';
  } else {
    installHelp.innerHTML = 'Open your browser menu and choose <b>Install SunnyClassDrive</b> or <b>Install app</b>, if available.';
  }
  installHelp.hidden = false;
}

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installBtn.hidden = false;
  installHelp.hidden = true;
});

installBtn.addEventListener("click", async () => {
  if (!deferredInstallPrompt) {
    showInstallHelp();
    return;
  }

  const promptEvent = deferredInstallPrompt;
  deferredInstallPrompt = null;
  try {
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice && choice.outcome === "accepted") {
      installBtn.hidden = true;
      installHelp.hidden = true;
    } else {
      showInstallHelp();
    }
  } catch (error) {
    console.warn("PWA install prompt could not be opened:", error);
    showInstallHelp();
  }
});

window.addEventListener("appinstalled", () => {
  installBtn.hidden = true;
  installHelp.hidden = true;
  toast("SunnyClassDrive installed successfully.");
});

// Keep a working manual-install option visible on browsers that do not
// expose beforeinstallprompt (including iOS Safari).
if (isAppInstalled()) {
  installBtn.hidden = true;
  installHelp.hidden = true;
} else {
  installBtn.hidden = false;
}

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js")
      .catch(error => console.warn("PWA service worker registration failed:", error));
  });
}

connectFirebase();
