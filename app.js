// SunnyClassDrive — public school file hub (no login).
// 1) Paste your Firebase web configuration below.
// 2) Keep the Firebase project in test/development only until rules are reviewed.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup, RecaptchaVerifier, signInWithPhoneNumber } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
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
let db, auth, currentUser = null;
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
function getFavouriteIds() {
  try { return new Set(JSON.parse(localStorage.getItem("scd-favourites") || "[]")); }
  catch (_) { return new Set(); }
}
let favouriteIds = getFavouriteIds();
let viewMode = "list";
function readLocalList(key) {
  try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch (_) { return []; }
}
let recentIds = readLocalList("scd-recent").slice(0, 40);
let downloadHistory = readLocalList("scd-downloads").slice(0, 40);
function saveLocalList(key, list) {
  try { localStorage.setItem(key, JSON.stringify(list.slice(0, 40))); }
  catch (_) { toast("Device storage is full; local history could not be saved."); }
}
function recordRecent(id) {
  recentIds = [id, ...recentIds.filter(item => item !== id)].slice(0, 40);
  saveLocalList("scd-recent", recentIds);
}
function recordDownload(file) {
  downloadHistory = [{ id:file.id, name:file.name, at:Date.now() }, ...downloadHistory.filter(item => item.id !== file.id)].slice(0, 40);
  saveLocalList("scd-downloads", downloadHistory);
}
function classOf(file) {
  const match = String(file.name || "").match(/(?:class|grade|std|standard)\s*(6|7|8|9|10|11|12)\b|\b(6|7|8|9|10|11|12)(?:th)?\s*(?:class|grade|std|standard)\b/i);
  return match ? (match[1] || match[2]) : "Other";
}
function subjectOf(file) {
  const name = String(file.name || "").toLowerCase();
  if (/math|algebra|geometry|trigon| गणित/.test(name)) return "Mathematics";
  if (/science|physics|chemistry|biology|lab|experiment/.test(name)) return "Science";
  if (/english|grammar|literature|poem|story/.test(name)) return "English";
  if (/history|geography|civics|political|economics|social.?science|sst/.test(name)) return "Social Science";
  return "Other";
}
function getFilteredBaseFiles() {
  if (activeFilter === "RECENT") return recentIds.map(id => allFiles.find(file => file.id === id)).filter(Boolean);
  if (activeFilter === "DOWNLOADS") return downloadHistory.map(item => allFiles.find(file => file.id === item.id)).filter(Boolean);
  return allFiles;
}
function toggleTheme() {
  const light = document.body.classList.toggle("light-theme");
  try { localStorage.setItem("scd-theme", light ? "light" : "dark"); } catch (_) {}
  $("themeToggle").textContent = light ? "☾" : "☼";
  $("themeToggle").setAttribute("aria-label", light ? "Switch to dark theme" : "Switch to light theme");
}
function applySavedTheme() {
  let theme = "dark";
  try { theme = localStorage.getItem("scd-theme") || "dark"; } catch (_) {}
  document.body.classList.toggle("light-theme", theme === "light");
  if ($("themeToggle")) {
    $("themeToggle").textContent = theme === "light" ? "☾" : "☼";
    $("themeToggle").setAttribute("aria-label", theme === "light" ? "Switch to dark theme" : "Switch to light theme");
  }
}

function toggleFavourite(id) {
  if (favouriteIds.has(id)) favouriteIds.delete(id);
  else favouriteIds.add(id);
  try { localStorage.setItem("scd-favourites", JSON.stringify([...favouriteIds])); }
  catch (_) { toast("Could not save favourites on this device."); }
  renderFiles();
}
function openPreview(file) {
  recordRecent(file.id);
  const modal = $("previewModal");
  const body = $("previewBody");
  const title = $("previewTitle");
  const open = $("previewOpen");
  const download = $("previewDownload");
  const url = file.downloadURL || "";
  const type = category(file);
  title.textContent = file.name || "File preview";
  open.href = url;
  download.href = url;
  body.innerHTML = "";
  if (type === "PDF") {
    const frame = document.createElement("iframe");
    frame.src = url;
    frame.title = "PDF preview";
    frame.className = "preview-frame";
    body.appendChild(frame);
  } else if (type === "IMAGE") {
    const image = document.createElement("img");
    image.src = url;
    image.alt = file.name || "Image preview";
    image.className = "preview-image";
    body.appendChild(image);
  } else {
    const message = document.createElement("div");
    message.className = "preview-unavailable";
    message.innerHTML = "<strong>Preview isn't available for this file type.</strong><p>You can open it in a new tab or download it.</p>";
    body.appendChild(message);
  }
  modal.hidden = false;
  document.body.classList.add("modal-open");
}
function closePreview() {
  $("previewModal").hidden = true;
  $("previewBody").innerHTML = "";
  document.body.classList.remove("modal-open");
}
function renderFiles() {
  const search = $("searchInput").value.trim().toLowerCase();
  const subjectFilter = $("subjectFilter")?.value || "all";
  let shown = getFilteredBaseFiles().filter(file => {
    const matchesCategory = activeFilter === "all" || activeFilter === "RECENT" || activeFilter === "DOWNLOADS"
      ? true
      : activeFilter === "FAVOURITES" ? favouriteIds.has(file.id) : category(file) === activeFilter;
    const matchesSearch = String(file.name || "").toLowerCase().includes(search);
    const matchesSubject = subjectFilter === "all" || subjectOf(file) === subjectFilter;
    const classFilter = $("classFilter")?.value || "all";
    const matchesClass = classFilter === "all" || classOf(file) === classFilter;
    return matchesCategory && matchesSearch && matchesSubject && matchesClass;
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
  $("favouriteCount").textContent = favouriteIds.size;
  $("filesHeading").textContent = activeFilter === "all" ? "All files" : activeFilter === "FAVOURITES" ? "Favourite files" : activeFilter === "RECENT" ? "Recently viewed" : activeFilter === "DOWNLOADS" ? "Download history" : `${activeFilter} files`;
  fileList.classList.toggle("grid-view", viewMode === "grid");
  fileList.parentElement.classList.toggle("grid-mode", viewMode === "grid");

  if (!shown.length) {
    fileList.innerHTML = `<div class="empty-state"><div>☁</div><h3>${activeFilter === "FAVOURITES" ? "No favourites yet" : allFiles.length ? "No matching files" : "No files uploaded yet"}</h3><p>${activeFilter === "FAVOURITES" ? "Tap the star on any file to save it here." : allFiles.length ? "Try another search or category." : "Upload the first file to your school workspace."}</p></div>`;
    return;
  }
  fileList.innerHTML = shown.map(file => {
    const type = category(file);
    const iconClass = type === "PDF" ? "pdf" : type === "PPT" ? "ppt" : type === "DOC" ? "doc" : type === "IMAGE" ? "image" : "other";
    const icon = type === "PDF" ? "PDF" : type === "PPT" ? "PPT" : type === "DOC" ? "DOC" : type === "IMAGE" ? "IMG" : "FILE";
    const fav = favouriteIds.has(file.id);
    return `<div class="file-row">
      <div class="file-name"><div class="file-symbol ${iconClass}">${icon}</div><div style="min-width:0"><strong title="${safeText(file.name)}">${safeText(file.name)}</strong><small>${safeText(file.originalName || file.name)}</small></div></div>
      <div class="file-meta"><span class="type-tag">${type}</span></div>
      <div class="file-meta file-size">${formatSize(file.size)}</div>
      <div class="file-meta file-date">${formatDate(file.createdAt)}</div>
      <div class="file-actions">
        <button class="row-action share-btn" type="button" data-share="${safeText(file.id)}" title="Share file" aria-label="Share ${safeText(file.name)}">↗</button>
        <button class="row-action preview-btn" type="button" data-preview="${safeText(file.id)}" title="Preview file" aria-label="Preview ${safeText(file.name)}">◉</button>
        <button class="row-action favourite-btn ${fav ? "is-favourite" : ""}" type="button" data-favourite="${safeText(file.id)}" title="${fav ? "Remove favourite" : "Add favourite"}" aria-label="${fav ? "Remove from" : "Add to"} favourites">${fav ? "★" : "☆"}</button>
        <button class="download-btn" title="Download ${safeText(file.name)}" aria-label="Download ${safeText(file.name)}" data-download="${safeText(file.downloadURL)}">↓</button>
      </div>
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
function installAuthUI() {
  document.querySelector(".topbar").insertAdjacentHTML("afterend",
    '<section class="auth-panel" id="authPanel"></section>' +
    '<div class="auth-form" id="authForm" hidden>' +
    '<strong>Uploader account</strong>' +
    '<button class="auth-action auth-wide" id="googleSignIn" type="button">Continue with Google</button>' +
    '<div class="auth-divider">OR</div>' +
    '<label>Phone number<input id="phoneNumber" type="tel" inputmode="tel" placeholder="+91 9876543210" autocomplete="tel"></label>' +
    '<div id="recaptcha-container"></div>' +
    '<button class="auth-action auth-wide" id="sendOtp" type="button">Send OTP</button>' +
    '<div id="otpArea" hidden><label>Verification code<input id="otpCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="Enter 6-digit OTP"></label><button class="primary-btn" id="verifyOtp" type="button">Verify &amp; sign in</button></div>' +
    '<details class="email-login"><summary>Use email and password instead</summary>' +
    '<form id="emailAuthForm"><label>Email<input id="authEmail" type="email" required autocomplete="username"></label><label>Password<input id="authPassword" type="password" minlength="6" required autocomplete="current-password"></label><button class="primary-btn" id="authSubmit" type="submit">Sign in</button><button class="auth-action" id="toggleAuth" type="button">Create account</button><button class="auth-action" id="resetPassword" type="button">Forgot password?</button></form></details>' +
    '<button class="auth-action" id="closeAuth" type="button">Close</button><p id="authMessage" aria-live="polite"></p></div>');
  let register = false, confirmationResult = null, recaptchaVerifier = null;
  const message = text => { $("authMessage").textContent = text; };
  $("googleSignIn").addEventListener("click", async () => {
    message("Opening Google sign-in…");
    try { await signInWithPopup(auth, new GoogleAuthProvider()); $("authForm").hidden = true; toast("Signed in with Google."); }
    catch (error) { message(error.message || "Google sign-in failed."); }
  });
  $("sendOtp").addEventListener("click", async () => {
    const phone = $("phoneNumber").value.trim().replace(/[\s()-]/g, "");
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) { message("Enter a valid phone number with country code, e.g. +91 9876543210."); return; }
    $("sendOtp").disabled = true; message("Preparing secure verification…");
    try {
      if (!recaptchaVerifier) recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });
      confirmationResult = await signInWithPhoneNumber(auth, phone, recaptchaVerifier);
      $("otpArea").hidden = false;
      message("OTP sent. Check your phone and enter the code.");
    } catch (error) {
      message(error.message || "Could not send OTP. Check Firebase Phone sign-in settings.");
      if (recaptchaVerifier) { try { await recaptchaVerifier.clear(); } catch (_) {} recaptchaVerifier = null; }
    } finally { $("sendOtp").disabled = false; }
  });
  $("verifyOtp").addEventListener("click", async () => {
    const code = $("otpCode").value.trim();
    if (!confirmationResult || !/^\d{6}$/.test(code)) { message("Enter the 6-digit verification code."); return; }
    try { await confirmationResult.confirm(code); $("authForm").hidden = true; toast("Phone number verified. Signed in."); }
    catch (error) { message(error.message || "OTP verification failed."); }
  });
  $("toggleAuth").addEventListener("click", () => { register = !register; $("authSubmit").textContent = register ? "Create account" : "Sign in"; $("toggleAuth").textContent = register ? "I already have an account" : "Create account"; });
  $("closeAuth").addEventListener("click", () => { $("authForm").hidden = true; });
  $("emailAuthForm").addEventListener("submit", async event => {
    event.preventDefault();
    const email = $("authEmail").value.trim(), password = $("authPassword").value;
    message("Please wait…");
    try {
      if (register) await createUserWithEmailAndPassword(auth, email, password);
      else await signInWithEmailAndPassword(auth, email, password);
      $("authForm").hidden = true; toast("Signed in successfully.");
    } catch (error) { message(error.message); }
  });
  $("resetPassword").addEventListener("click", async () => {
    const email = $("authEmail").value.trim();
    if (!email) { message("Enter your email first."); return; }
    try { await sendPasswordResetEmail(auth, email); message("Password reset email sent."); }
    catch (error) { message(error.message); }
  });
}
function connectFirebase() {
  if (!configReady()) {
    fileList.innerHTML = `<div class="empty-state"><div>☁</div><h3>Firebase setup required</h3><p>Follow SETUP.md and add your Firebase web config in app.js.</p></div>`;
    $("totalFiles").textContent = "—";
    $("totalPpt").textContent = "—";
    $("totalDocs").textContent = "—";
    return;
  }
  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    installAuthUI();
    onAuthStateChanged(auth, user => {
      currentUser = user;
      const panel = $("authPanel");
      if (user) {
        panel.innerHTML = '<div class="auth-status">Signed in as <strong>' + safeText(user.displayName || user.email || user.phoneNumber || "Uploader") + '</strong><button class="auth-action" id="signOutBtn">Sign out</button></div>';
        $("dropZone").hidden = false;
        $("uploadTopBtn").hidden = false;
        $("signOutBtn").addEventListener("click", () => signOut(auth).catch(error => toast(error.message)));
      } else {
        panel.innerHTML = '<div class="auth-status">Sign in to upload. Anyone can browse and download.<button class="auth-action" id="showAuthBtn">Sign in / Register</button></div>';
        $("dropZone").hidden = true;
        $("uploadTopBtn").hidden = true;
        $("showAuthBtn").addEventListener("click", () => { $("authForm").hidden = false; });
      }
    });
    const filesQuery = query(collection(db, "schoolFiles"), orderBy("createdAt", "desc"));
    onSnapshot(filesQuery, snapshot => {
      allFiles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      renderFiles();
    }, error => {
      console.error(error);
      fileList.innerHTML = `<div class="empty-state"><div>⚠</div><h3>Could not load files</h3><p>Check Firestore rules and internet connection.</p></div>`;
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
$("subjectFilter").addEventListener("change", renderFiles);
$("classFilter").addEventListener("change", renderFiles);
$("notesNavButton").addEventListener("click", () => {
  let saved = ""; try { saved = localStorage.getItem("scd-offline-notes") || ""; } catch (_) {}
  openUtility("My offline notes", '<p>These notes are stored only in this browser on this device.</p><textarea id="offlineNotes" rows="9" style="width:100%;resize:vertical;background:#0b1728;color:#edf3ff;border:1px solid #405a78;border-radius:9px;padding:11px;font:12px DM Sans,sans-serif"></textarea><button id="saveOfflineNotes" class="primary-btn" type="button">Save notes</button>');
  $("offlineNotes").value = saved;
  $("saveOfflineNotes").addEventListener("click", () => {
    try { localStorage.setItem("scd-offline-notes", $("offlineNotes").value); toast("Notes saved on this device."); closeUtility(); }
    catch (_) { toast("Could not save notes. Device storage may be full."); }
  });
});
$("themeToggle").addEventListener("click", toggleTheme);
applySavedTheme();
document.querySelectorAll(".nav-item").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));
  button.classList.add("active");
  activeFilter = button.dataset.filter;
  $("breadcrumbName").textContent = button.textContent.trim().replace(/\s+\d+$/, "");
  renderFiles();
  $("sidebar").classList.remove("open");
}));
fileList.addEventListener("click", event => {
  const favouriteButton = event.target.closest("[data-favourite]");
  if (favouriteButton) { toggleFavourite(favouriteButton.dataset.favourite); return; }
  const shareButton = event.target.closest("[data-share]");
  if (shareButton) {
    const file = allFiles.find(item => item.id === shareButton.dataset.share);
    if (file?.downloadURL) {
      const shareData = { title:file.name, text:"Shared from SunnyClassDrive", url:file.downloadURL };
      if (navigator.share) navigator.share(shareData).catch(() => {});
      else if (navigator.clipboard?.writeText) navigator.clipboard.writeText(file.downloadURL).then(() => toast("Share link copied."), () => toast("Could not copy link. Open the file and copy its URL."));
      else toast("Open the file, then copy its address to share.");
    }
    return;
  }
  const previewButton = event.target.closest("[data-preview]");
  if (previewButton) {
    const file = allFiles.find(item => item.id === previewButton.dataset.preview);
    if (file) openPreview(file);
    return;
  }
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
document.querySelectorAll("[data-close-preview]").forEach(button => button.addEventListener("click", closePreview));
const utilityModal = $("utilityModal");
function openUtility(title, content) {
  $("utilityTitle").textContent = title;
  $("utilityContent").innerHTML = content;
  utilityModal.hidden = false;
  document.body.classList.add("modal-open");
}
function closeUtility() {
  utilityModal.hidden = true;
  document.body.classList.remove("modal-open");
}
document.querySelectorAll("[data-close-utility]").forEach(node => node.addEventListener("click", closeUtility));
$("shortcutsBtn").addEventListener("click", () => openUtility("Keyboard shortcuts", '<p><kbd>Ctrl</kbd> + <kbd>K</kbd> or <kbd>/</kbd> — Search files</p><p><kbd>Esc</kbd> — Close open dialog</p><p><kbd>G</kbd> — Switch list/grid view</p>'));
$("feedbackBtn").addEventListener("click", () => {
  const subject = encodeURIComponent("SunnyClassDrive feedback");
  const body = encodeURIComponent("Hi, I would like to share feedback about SunnyClassDrive:\n\n");
  window.location.href = "mailto:nazish906024@gmail.com?subject=" + subject + "&body=" + body;
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    if (!$("previewModal").hidden) closePreview();
    if (!utilityModal.hidden) closeUtility();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault(); $("searchInput").focus(); $("searchInput").select();
  } else if (event.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
    event.preventDefault(); $("searchInput").focus();
  } else if (event.key.toLowerCase() === "g" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
    viewMode = viewMode === "list" ? "grid" : "list";
    $("viewToggle").textContent = viewMode === "list" ? "▦" : "☷";
    renderFiles();
  }
});
$("viewToggle").addEventListener("click", () => {
  viewMode = viewMode === "list" ? "grid" : "list";
  $("viewToggle").textContent = viewMode === "list" ? "▦" : "☷";
  $("viewToggle").setAttribute("aria-label", viewMode === "list" ? "Switch to grid view" : "Switch to list view");
  renderFiles();
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
