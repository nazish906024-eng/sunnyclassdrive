// SunnyClassDrive — public school file hub (no login).
// 1) Paste your Firebase web configuration below.
// 2) Keep the Firebase project in test/development only until rules are reviewed.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
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
let db, storage;

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
  const ext = extension(file.name);
  if (!ALLOWED_EXTENSIONS.has(ext)) throw new Error(`${file.name}: file type not supported.`);
  if (file.size > MAX_FILE_SIZE) throw new Error(`${file.name}: larger than 25 MB.`);
  if (file.size === 0) throw new Error(`${file.name}: empty files cannot be uploaded.`);

  const safeName = file.name.replace(/[^\w.\-() ]/g, "_").slice(0, 100);
  const uniqueName = `${Date.now()}_${crypto.randomUUID()}_${safeName}`;
  const path = `school-files/${uniqueName}`;
  const objectRef = storageRef(storage, path);
  const progressBox = $("uploadProgress");
  progressBox.hidden = false;
  $("progressTitle").textContent = `Uploading ${file.name}`;
  $("progressDetail").textContent = "Please keep this page open.";
  $("progressPercent").textContent = "0%";
  $("progressBar").style.width = "0%";

  await new Promise((resolve, reject) => {
    const task = uploadBytesResumable(objectRef, file, {
      contentType: file.type || "application/octet-stream",
      customMetadata: { originalName: safeName }
    });
    task.on("state_changed",
      snapshot => {
        const percent = Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100);
        $("progressPercent").textContent = `${percent}%`;
        $("progressBar").style.width = `${percent}%`;
      },
      reject,
      async () => {
        try {
          const downloadURL = await getDownloadURL(task.snapshot.ref);
          await addDoc(collection(db, "schoolFiles"), {
            name: safeName,
            originalName: safeName,
            storagePath: path,
            downloadURL,
            size: file.size,
            contentType: file.type || "application/octet-stream",
            createdAt: serverTimestamp()
          });
          resolve();
        } catch (error) { reject(error); }
      }
    );
  });
}
async function handleFiles(files) {
  if (!files?.length) return;
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
    storage = getStorage(app);
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

$("browseBtn").addEventListener("click", () => $("fileInput").click());
$("uploadTopBtn").addEventListener("click", () => $("fileInput").click());
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
$("year").textContent = new Date().getFullYear();

// Progressive Web App: show the native install prompt when supported.
let deferredInstallPrompt = null;
const installBtn = $("installBtn");
const installHelp = $("installHelp");

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installBtn.hidden = false;
  installHelp.hidden = true;
});
installBtn.addEventListener("click", async () => {
  if (!deferredInstallPrompt) {
    installHelp.hidden = false;
    return;
  }
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installBtn.hidden = true;
});
window.addEventListener("appinstalled", () => {
  installBtn.hidden = true;
  installHelp.hidden = true;
  toast("SunnyClassDrive installed successfully.");
});
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js")
      .catch(error => console.warn("PWA service worker registration failed:", error));
  });
}
// On browsers without the install prompt event, reveal a short install hint.
setTimeout(() => {
  const standalone = window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
  if (!standalone && installBtn.hidden) installHelp.hidden = false;
}, 2500);

connectFirebase();
