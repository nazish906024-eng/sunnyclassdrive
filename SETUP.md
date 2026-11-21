# SunnyClassDrive — beginner setup guide

## What this version does
- No login, signup, password or OTP.
- Anyone with the website link can view/download files and upload supported files.
- Public delete and replace are disabled.
- Files are limited to 25 MB each and selected school-friendly file types.
- This is a public shared workspace, not private storage.

## Step 1 — Create a Firebase project
1. Open https://console.firebase.google.com/
2. Sign in with your Google account and choose **Add project**.
3. Name it `SunnyClassDrive` (or another name).
4. Finish the project creation.

## Step 2 — Register the website
1. In Firebase project overview, click the Web icon `</>`.
2. Register an app named `SunnyClassDrive`.
3. Firebase will show a `firebaseConfig` object.
4. Copy the values into the matching fields in `app.js`.
   - `apiKey`
   - `authDomain`
   - `projectId`
   - `storageBucket`
   - `messagingSenderId`
   - `appId`
5. Do not paste the whole config over the code; replace only the placeholder values.

## Step 3 — Enable Firestore
1. Firebase console → Build → Firestore Database.
2. Click Create database.
3. Choose a region close to your users (for example, an India region if available).
4. Create the database.
5. Open the **Rules** tab, replace the rules with the contents of `firestore.rules`, then click **Publish**.

## Step 4 — Enable Storage
1. Firebase console → Build → Storage.
2. Click Get started and follow the setup.
3. Open the **Rules** tab.
4. Replace the rules with the contents of `storage.rules`.
5. Click **Publish**.

Firebase may require a billing-enabled project for Cloud Storage, depending on current Firebase plan and project eligibility. Check the Firebase console's current plan and pricing before enabling it. Do not enable billing without a parent/guardian or school administrator's approval.

## Step 5 — Test locally
Do not open `index.html` by double-clicking it. Run a local web server:
- If you use VS Code, install the **Live Server** extension.
- Open the SunnyClassDrive folder in VS Code.
- Right-click `index.html` → **Open with Live Server**.
- Test upload and download.

## Step 6 — Publish online
You can publish the folder using GitHub Pages:
1. Create a GitHub repository, for example `classcloud`.
2. Upload `index.html`, `style.css`, and `app.js`.
3. Also upload `firestore.rules` and `storage.rules` for reference (they are pasted into Firebase, not executed by GitHub Pages).
4. Repository → Settings → Pages.
5. Choose Deploy from branch → `main` → `/root` → Save.
6. Wait for the published website URL.

## Important security and cost warning
This no-login version is public by design:
- Anyone who has the URL can list, download and upload files.
- Download URLs are public bearer links; do not share sensitive/private files.
- Public upload can be abused and may create storage/download costs.
- Public deletion and replacement are blocked.
- File extension and MIME type checks are basic safeguards, not malware scanning.
- The first version has no moderation queue, quota per person, user identity, or admin controls.

For a real school-wide deployment, ask a teacher/school IT administrator to approve it. A safer next version would keep login removed but require a school-only upload code, or use teacher approval for uploads. Do not put a secret code in public JavaScript and assume it is secure.


## PWA install button
The website now includes a PWA install button in supported browsers.
- Deploy the site over HTTPS (GitHub Pages provides HTTPS).
- Open the deployed site in Chrome on Android.
- Tap **Install app** when it appears, then confirm.
- If Chrome does not show the button, open the browser menu (⋮) and choose **Install app** or **Add to Home screen**.
- On iPhone/iPad Safari, use Share → Add to Home Screen.

The PWA app shell can open offline after it has been visited once, but Firebase file listing, uploads and downloads still require an internet connection. This is a web app installation, not an APK download.


## Firebase configuration
The Firebase web configuration supplied for project `sunnyclassdrive-58e61` has already been inserted into `app.js`. The app uses Firebase's browser CDN modules for Storage and Firestore; you do not need to paste the `import { initializeApp } from 'firebase/app'` snippet from the Firebase console. Analytics is not required for file upload/download.
