# SunnyClassDrive — authenticated uploads, public downloads

## Access behavior
- Anyone can browse the library and download public files without signing in.
- Users must sign in with Firebase before uploading.
- New uploads are stored in the public Supabase Storage bucket named `school-files`.
- Existing Firebase Storage links may remain in the library; new uploads use Supabase.

## 1. Firebase Authentication
In Firebase Console → Authentication → Sign-in method, enable the providers you want to offer:
- **Email/Password** for email sign-in, account creation, and password reset.
- **Google** for Google sign-in.
- **Phone** for OTP sign-in. Configure the required phone-auth settings and authorized domains.

In Firebase Console → Authentication → Settings → Authorized domains, add your GitHub Pages host:
`nazish906024-eng.github.io`

## 2. Firestore rules
Publish the rules from `firestore.rules` in Firebase Console → Firestore Database → Rules. They allow public reads and authenticated creation of file metadata tied to the signed-in user's UID. Updates and deletes are disabled.

## 3. Supabase Storage bucket
In Supabase Dashboard → Storage, create a bucket named **school-files** and mark it **Public**. Do not create anonymous upload policies. Public access is needed for reading/downloading; the Edge Function performs uploads using its server-side service-role key.

## 4. Deploy the Supabase Edge Function
The function source is `supabase/functions/upload-file/index.ts`. Deploy it with the name `upload-file`. In the function settings, turn **Verify JWT OFF** because this function validates the Firebase ID token itself.

Set these Edge Function secrets in Supabase:
- `FIREBASE_WEB_API_KEY`: the Firebase web API key already present in `app.js`.
- `SUPABASE_URL`: `https://vwewwowlpaqdtutyniou.supabase.co`.
- `SUPABASE_SERVICE_ROLE_KEY`: your Supabase service-role/secret key. Store it only in Supabase Function Secrets. Never put it in `app.js`, GitHub, or a public message.

CLI commands (run locally from the repository folder):
```bash
supabase functions deploy upload-file --no-verify-jwt
supabase secrets set FIREBASE_WEB_API_KEY=YOUR_FIREBASE_WEB_API_KEY SUPABASE_URL=https://vwewwowlpaqdtutyniou.supabase.co SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
```
Replace placeholders in your own terminal. Do not share the service-role key.

## 5. Deploy the delete function
The source is `supabase/functions/delete-file/index.ts`. Deploy it with JWT verification OFF; it validates the Firebase ID token itself. It uses the existing `FIREBASE_WEB_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` secrets.

```bash
supabase functions deploy delete-file --no-verify-jwt
```

Also publish the updated `firestore.rules` in Firebase Console → Firestore Database → Rules. Without the updated rules, rename and metadata deletion will be rejected.

## 6. Test
1. Open SunnyClassDrive and sign in with an enabled provider.
2. Upload a small PDF.
3. Check that it appears in the library.
4. Open the site in a private browser window; the file should appear and download without signing in.

**Important:** GitHub Pages only hosts the static website. Updating the Edge Function source in GitHub does not deploy it to Supabase; the function must be deployed separately.


## 7. Rename files and administrator access
The repository includes a `rename-file` Edge Function. It copies the object to a new Storage path, updates the Firestore metadata, then removes the old object. Deploy it with Verify JWT OFF, just like the other functions.

Set `ADMIN_FIREBASE_UID` in Supabase Edge Function Secrets to the administrator's Firebase Authentication UID. Replace `SET_ADMIN_UID_HERE` in both `app.js` and `firestore.rules` with that same UID. Then publish `firestore.rules` in Firebase Console. The UID is an identifier, not a password; never put any service-role key in website code.

The administrator will see Rename and Delete controls on every file. Other signed-in users can manage only files they uploaded. The Edge Functions independently check the administrator UID, so changing the browser-side value alone does not grant admin permissions.

Deploy:
```bash
supabase functions deploy rename-file --no-verify-jwt
supabase functions deploy delete-file --no-verify-jwt
```
