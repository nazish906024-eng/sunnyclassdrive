const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");

initializeApp();

setGlobalOptions({
  region: "asia-south1",
  maxInstances: 10
});

const auth = getAuth();
const db = getFirestore();
const EMAIL_DOMAIN = "@accounts.sunnyclassdrive.invalid";

function normalizeUsername(value) {
  const username = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,19}$/.test(username)) {
    throw new HttpsError(
      "invalid-argument",
      "Username must be 3–20 characters and use letters, numbers, dots, underscores or hyphens."
    );
  }
  return username;
}

function usernameEmail(username) {
  return username + EMAIL_DOMAIN;
}

function requireAdmin(request) {
  if (!request.auth || request.auth.token.admin !== true || request.auth.token.role !== "admin") {
    throw new HttpsError("permission-denied", "Only the administrator can perform this action.");
  }
}

function validatePassword(password) {
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    throw new HttpsError("invalid-argument", "Password must be between 8 and 128 characters.");
  }
}

async function getStudent(uid) {
  if (typeof uid !== "string" || !uid.trim()) {
    throw new HttpsError("invalid-argument", "A valid student account is required.");
  }
  let user;
  try {
    user = await auth.getUser(uid);
  } catch (_) {
    throw new HttpsError("not-found", "Student account was not found.");
  }
  if (user.customClaims?.role !== "student" || user.customClaims?.admin === true) {
    throw new HttpsError("failed-precondition", "This action is only available for student accounts.");
  }
  return user;
}

exports.createStudentAccount = onCall(async (request) => {
  requireAdmin(request);

  const username = normalizeUsername(request.data?.username);
  const displayName = String(request.data?.displayName || "").trim().slice(0, 60);
  const password = request.data?.password;

  if (!displayName) {
    throw new HttpsError("invalid-argument", "Student name is required.");
  }
  validatePassword(password);

  const usernameRef = db.collection("usernames").doc(username);
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(usernameRef);
    if (existing.exists) {
      throw new HttpsError("already-exists", "That username is already taken.");
    }
    transaction.create(usernameRef, {
      username,
      uid: null,
      displayName,
      role: "student",
      active: false,
      status: "provisioning",
      createdAt: FieldValue.serverTimestamp()
    });
  });

  let createdUser = null;
  try {
    createdUser = await auth.createUser({
      email: usernameEmail(username),
      password,
      displayName,
      disabled: false,
      emailVerified: false
    });

    await auth.setCustomUserClaims(createdUser.uid, {
      role: "student",
      admin: false,
      username
    });

    const batch = db.batch();
    batch.set(db.collection("users").doc(createdUser.uid), {
      uid: createdUser.uid,
      username,
      displayName,
      role: "student",
      active: true,
      createdAt: FieldValue.serverTimestamp()
    });
    batch.update(usernameRef, {
      uid: createdUser.uid,
      active: true,
      status: "active"
    });
    await batch.commit();

    return { uid: createdUser.uid, username, displayName };
  } catch (error) {
    if (createdUser) {
      try { await auth.deleteUser(createdUser.uid); } catch (_) {}
    }
    try { await usernameRef.delete(); } catch (_) {}
    if (error instanceof HttpsError) throw error;
    console.error("createStudentAccount failed:", error);
    throw new HttpsError("internal", "Could not create the student account. Please try again.");
  }
});

exports.listStudentAccounts = onCall(async (request) => {
  requireAdmin(request);
  const snapshot = await db.collection("usernames").where("role", "==", "student").get();

  const students = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      uid: data.uid || "",
      username: data.username || doc.id,
      displayName: data.displayName || "",
      active: data.active === true,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null
    };
  }).filter((student) => student.uid);

  students.sort((a, b) => (a.username || "").localeCompare(b.username || ""));
  return { students };
});

exports.setStudentDisabled = onCall(async (request) => {
  requireAdmin(request);
  const uid = String(request.data?.uid || "");
  const disabled = request.data?.disabled;
  if (typeof disabled !== "boolean") {
    throw new HttpsError("invalid-argument", "A valid enabled/disabled status is required.");
  }

  const student = await getStudent(uid);
  const username = student.customClaims?.username;
  await auth.updateUser(uid, { disabled });
  if (disabled) {
    await auth.revokeRefreshTokens(uid);
  }

  const batch = db.batch();
  batch.set(db.collection("users").doc(uid), { active: !disabled }, { merge: true });
  if (username) {
    batch.set(db.collection("usernames").doc(username), { active: !disabled }, { merge: true });
  }
  await batch.commit();

  return { uid, active: !disabled };
});

exports.resetStudentPassword = onCall(async (request) => {
  requireAdmin(request);
  const uid = String(request.data?.uid || "");
  const newPassword = request.data?.newPassword;
  validatePassword(newPassword);

  await getStudent(uid);
  await auth.updateUser(uid, { password: newPassword });
  await auth.revokeRefreshTokens(uid);
  return { success: true };
});

exports.deleteStudentAccount = onCall(async (request) => {
  requireAdmin(request);
  const uid = String(request.data?.uid || "");
  const student = await getStudent(uid);
  const username = student.customClaims?.username;

  await auth.deleteUser(uid);
  const batch = db.batch();
  batch.delete(db.collection("users").doc(uid));
  if (username) {
    batch.delete(db.collection("usernames").doc(username));
  }
  await batch.commit();

  return { success: true };
});
