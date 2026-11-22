# SunnyClassDrive — admin-created username login

## What this setup does

- Students and administrators sign in using **username + password**.
- There is no public signup form.
- Only an authenticated administrator can create, disable, re-enable, reset the password for, or delete student accounts.
- Anyone can still browse and download the existing public school-file library.
- Only an active signed-in student/admin can upload files.
- New uploads continue to use the existing Supabase Storage bucket and Edge Function. This change does not move file storage to Firebase Storage.

## 1. Firebase Authentication

In Firebase Console for project `sunnyclassdrive-58e61`:

1. Open **Authentication → Sign-in method** and enable **Email/Password**.
2. Open **Authentication → Settings → User actions**.
3. Disable end-user **account creation** and **account deletion**. This is important: hiding a signup button in HTML alone is not security.
4. In **Authentication → Settings → Authorized domains**, make sure `nazish906024-eng.github.io` is listed.

The website converts a username to an internal synthetic email address ending in `@accounts.sunnyclassdrive.invalid`. Students never type or need a real email address. Do not use this synthetic address for email delivery or password-reset emails; administrators reset passwords from the admin panel.

## 2. Create the first administrator

You must bootstrap one administrator before the admin dashboard can create student accounts.

1. In **Authentication → Users**, click **Add user**.
2. Create the admin with this email format (replace `admin` if you want a different username):
   `admin@accounts.sunnyclassdrive.invalid`
3. Set a strong password and save the account.
4. Copy the new user's **UID**.
5. On a trusted local computer, install Node.js 20 and the Firebase CLI. Authenticate with Google Cloud Application Default Credentials (for example, run `gcloud auth application-default login`) or set `GOOGLE_APPLICATION_CREDENTIALS` to a local service-account JSON file. Never upload that JSON file to GitHub or share it in chat.
6. From the repository folder, run:

```bash
cd functions
npm install
node scripts/promote-admin.js FIREBASE_AUTH_UID admin
```

Replace `FIREBASE_AUTH_UID` with the UID copied in step 4. If you chose a different username in step 2, use that exact username instead of `admin`.

The script assigns the admin custom claim and creates the protected Firestore profile. It does not store the password in Firestore. Sign out and sign in again after running the script so the browser receives the new admin claim.

## 3. Deploy Cloud Functions and Firestore rules

Cloud Functions deployment requires the Firebase project to be on the **Blaze (pay-as-you-go) plan**. Review billing and set a budget alert with the account owner before deploying.

From the repository root:

```bash
firebase login
firebase use sunnyclassdrive-58e61
cd functions
npm install
cd ..
firebase deploy --only functions,firestore:rules
```

The functions are deployed to `asia-south1`. The callable functions verify the Firebase ID token and the server-side `admin: true` custom claim. Never put the Admin SDK service-account key in browser JavaScript.

## 4. Admin dashboard

1. Open SunnyClassDrive and sign in with the admin username and password.
2. The **Admin · Student accounts** panel appears.
3. Create student accounts by entering a unique username, student name, and temporary password (minimum 8 characters).
4. Share credentials privately with the intended student.
5. Use the account list to disable/re-enable accounts, reset passwords, or delete student accounts.

Usernames are case-insensitive and must be 3–20 characters. Allowed characters: letters, numbers, dots, underscores, and hyphens. Student passwords must be 8–128 characters.

## 5. Firestore data and security

- `users/{uid}`: private profile and active status. A user can read only their own profile; clients cannot write it.
- `usernames/{username}`: username-to-UID mapping. Clients cannot read or write this collection.
- `schoolFiles/{fileId}`: public file metadata, matching the existing public browse/download experience. Only active authenticated accounts can create metadata.

Publish `firestore.rules` through the Firebase CLI command above. The Admin SDK used by Cloud Functions bypasses Firestore client rules, so the functions enforce admin claims themselves.

## 6. Supabase file uploads stay as they are

The existing `app.js` still sends the Firebase ID token to the Supabase `upload-file` Edge Function. Keep the existing Supabase bucket and Edge Function secrets configured as before. Do not paste the Supabase service-role key into `app.js`, GitHub, or a public message.

## 7. Test checklist

- [ ] Public visitors can browse and download files.
- [ ] A visitor cannot upload without signing in.
- [ ] A random username/password cannot create an account.
- [ ] The admin can sign in and see the account-management panel.
- [ ] The admin can create a student account.
- [ ] The student can sign in using only username and password.
- [ ] A disabled student cannot sign in or upload.
- [ ] A student cannot access admin callable functions.
- [ ] Supabase uploads still work with the Firebase ID token.

If you later change the Firebase project or the Functions region, update the matching project/region values in `app.js`, `functions/index.js`, and `functions/scripts/promote-admin.js`.
