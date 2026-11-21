# SunnyClassDrive — authenticated uploads, public downloads

## Access behavior
- Anyone can browse the library and download public files without signing in.
- Only users signed in with Firebase Email/Password can upload.
- New uploads are stored in Supabase Storage in the public bucket named `school-files`.
- Existing Firebase Storage file links remain in the library; new uploads use Supabase.

## 1. Firebase Authentication
In Firebase Console → Authentication → Sign-in method, enable **Email/Password**. The website now provides sign-in, account creation, sign-out, and password reset.

## 2. Supabase Storage bucket
In Supabase Dashboard → Storage, create a bucket named **school-files** and mark it **Public**. Do not create anonymous upload policies. Public access is needed only for reading/downloading; the Edge Function performs uploads using its server-side service-role key.

## 3. Deploy the Supabase Edge Function
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
Replace the placeholders in your own terminal. Do not send the service-role key to anyone.

## 4. Firestore rules
Publish the rules from `firestore.rules` in Firebase Console → Firestore Database → Rules. These allow public reads but require an authenticated user to create file metadata tied to their own Firebase UID. Updates and deletes are disabled.

## 5. Test
1. Open SunnyClassDrive and choose **Sign in / Register**.
2. Create an uploader account.
3. Upload a small PDF.
4. Sign out, or open the website in a private browser window. The file should still appear and download without signing in.
