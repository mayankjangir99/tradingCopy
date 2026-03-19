# TradePro APK Build Steps

This project is now prepared with real PWA icons for Android packaging.

## 1. Deploy the app on HTTPS

You need a live frontend URL such as:

- `https://your-site.netlify.app`
- `https://your-site.vercel.app`
- `https://your-custom-domain.com`

Your backend also needs to be live and reachable from that frontend.

## 2. Verify the hosted app

Open the live site in Chrome and confirm:

- `index.html` loads
- login works
- dashboard works
- `manifest.webmanifest` loads
- service worker registers

## 3. Check installability in Chrome

Open Chrome DevTools and verify:

- `Application -> Manifest`
- icons appear correctly
- no manifest errors
- service worker is active

If Chrome offers "Install app", the site is in good shape.

## 4. Generate the Android wrapper

Go to:

- `https://www.pwabuilder.com/`

Then:

1. Paste your live frontend URL.
2. Wait for analysis.
3. Fix any remaining warnings it shows.
4. Choose `Android`.
5. Download the generated Android Studio project.

## 5. Build the APK in Android Studio

1. Open the generated Android project in Android Studio.
2. Wait for Gradle sync to complete.
3. Set your package name if needed.
4. Open:
   `Build -> Build Bundle(s) / APK(s) -> Build APK(s)`
5. For Play Store:
   `Build -> Generate Signed Bundle / APK -> Android App Bundle`

## 6. Test the APK

Install the generated APK on your Android phone and check:

- login
- backend API requests
- navigation between pages
- stock page loading
- PWA shell/offline behavior

## 7. If you want Play Store upload

Use an `.aab` instead of only an `.apk`.

You will also need:

- a signed release key
- Play Store listing assets
- privacy policy if required by your integrations

## Important files in this repo

- `manifest.webmanifest`
- `sw.js`
- `icons/icon-192.png`
- `icons/icon-512.png`
- `icons/icon-512-maskable.png`
- `favicon.png`

The same files are mirrored in `docs/` as well.
