const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const PROJECT_ID = "sunnyclassdrive-58e61";
const EMAIL_DOMAIN = "@accounts.sunnyclassdrive.invalid";

async function main() {
  const uid = process.argv[2];
  const username = String(process.argv[3] || "").trim().toLowerCase();

  if (!uid || !/^[a-z0-9][a-z0-9._-]{2,19}$/.test(username)) {
    console.error("Usage: node scripts/promote-admin.js FIREBASE_AUTH_UID username");
    process.exit(1);
  }

  initializeApp({
    credential: applicationDefault(),
    projectId: PROJECT_ID
  });

  const auth = getAuth();
  const db = getFirestore();
  const user = await auth.getUser(uid);
  const expectedEmail = username + EMAIL_DOMAIN;

  if ((user.email || "").toLowerCase() !== expectedEmail) {
    throw new Error("The Firebase Auth user's email must be exactly: " + expectedEmail);
  }

  const usernameRef = db.collection("usernames").doc(username);
  const existing = await usernameRef.get();
  if (existing.exists && existing.data().uid && existing.data().uid !== uid) {
    throw new Error("That username is already assigned to another account.");
  }

  await auth.setCustomUserClaims(uid, {
    ...(user.customClaims || {}),
    admin: true,
    role: "admin",
    username
  });

  const batch = db.batch();
  batch.set(usernameRef, {
    uid,
    username,
    displayName: user.displayName || "Administrator",
    role: "admin",
    active: true,
    status: "active",
    createdAt: FieldValue.serverTimestamp()
  }, { merge: true });
  batch.set(db.collection("users").doc(uid), {
    uid,
    username,
    displayName: user.displayName || "Administrator",
    role: "admin",
    active: true,
    createdAt: FieldValue.serverTimestamp()
  }, { merge: true });
  await batch.commit();

  console.log("Admin role assigned to @" + username + ". Sign out and sign in again to refresh the token.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
