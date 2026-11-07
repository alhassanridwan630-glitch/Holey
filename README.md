# Holey! - a game by Sonic Legacy

Plain HTML/JS game (`index.html`) plus Vercel serverless functions (`api/`). There is **no build step**.
Secrets live ONLY in Vercel environment variables. Nothing in this ZIP contains a secret key.

## Project map
| Path | What it is |
|---|---|
| `index.html`, `config.js` | The game. `config.js` holds PUBLIC settings only (Paystack public key, Firebase web config). |
| `api/_catalog.js` | Premium products, prices, bundle/ownership rules, and which products are for sale (`enabled`). |
| `api/_maps.js`, `api/_premium.js` | Premium course data. Sent only to accounts that own that map. |
| `api/init.js` | Starts a Paystack checkout. The server picks the price. |
| `api/premium.js` | Confirms payments with Paystack and returns ownership + owned map data (also powers "Restore purchases"). |
| `api/catalog.js` | Personalised prices (what this account would pay). |
| `api/webhook.js` | Paystack webhook (signature checked, then re-verified with Paystack). |
| `api/profile.js`, `api/delete.js` | Name/avatar sync; account + data deletion. |
| `scripts/migrate-ownership.js` | One-time, re-runnable database migration. |
| `tests/` | `npm test` payment/ownership/migration tests (use a simulated database, need no credentials). |
| `.vercelignore` | Keeps `scripts/`, `tests/`, `README.md` out of the public deployment. |

## Prices and ownership (approved)
| Product | Price |
|---|---|
| Celestial Atoll (`atoll`) | NGN 3,400 |
| Toy World (`toy`) | NGN 2,500 |
| Third Premium Map (`third`) | NGN 2,500 |
| Toy World + Third Map (`bundle_new`) | NGN 4,000 |
| Complete Premium Collection (`bundle_all`) | NGN 6,800 |

Rules enforced by the server: one-time, permanent, no subscriptions. A player pays only for maps they do not own: the price is the cheapest way to buy exactly the missing maps from the list above, so owning more never costs more (e.g. Atoll owner buying the Complete Collection pays 4,000; Toy World owner pays 5,900 for the two missing maps; owning all three means nothing to pay). Ownership is stored per map: `users/{uid}.owned.atoll / .toy / .third`.
Toy World, the third map and both bundles are **switched off** (`enabled:false` in `api/_catalog.js`) until their maps ship, so nobody can pay for content that does not exist yet.
Diamond, Galaxy and Animated Premium balls stay coin-only purchases inside the game.

## YOU must complete these steps (nothing here is configured for you)
### 1. Firebase (project `holey--game`)
- Authentication > Sign-in method: **Email/Password** enabled (you did this).
- Build > **Firestore Database** > Create database (production mode). Set the rules to deny all client access, because only the server touches data:
  `rules_version='2'; service cloud.firestore { match /databases/{db}/documents { match /{document=**} { allow read, write: if false; } } }`
- Project settings > **Service accounts** > Generate new private key. Keep the JSON private.
### 2. Paystack
- Dashboard > Settings > API Keys & Webhooks: copy the **Secret key** (use the *test* key first, then the *live* key).
- Set **Webhook URL** to `https://YOUR-DOMAIN/api/webhook`.
### 3. Vercel environment variables (Project > Settings > Environment Variables)
| Name | Value | Required |
|---|---|---|
| `PAYSTACK_SECRET_KEY` | your Paystack secret key | yes |
| `FIREBASE_SERVICE_ACCOUNT` | the whole service-account JSON | yes |
| `SITE_URL` | `https://YOUR-DOMAIN` (only if checkout returns to the wrong address) | optional |
Never put these in `config.js`, in git, or in the ZIP. Redeploy after adding them. If a secret is ever exposed, rotate it immediately.
### 4. Vercel Web Analytics
Project > **Analytics** tab > Enable, then redeploy.
### 5. Privacy and legal configuration
- The in-game Privacy Policy and Terms (Settings) describe: local progress, Firebase accounts, Paystack payments, Vercel hosting/analytics, deletion. Have a qualified person review them.
- For app stores and for linking from your site you will also need a **public privacy-policy URL** and a **data-deletion URL/instructions** (in-game: Settings > Delete my data, or email Soniclegacystore@gmail.com).
- If you later add Game Center / Google Play Games, update the policy: it currently says they are not connected.

## Database migration (existing Celestial Atoll buyers)
Existing buyers already keep access with NO migration: the server treats the old `premium:true` flag as owning Atoll. The migration just writes the new `owned.atoll` field and tags old payment records `item:'atoll'`. Run it once before you switch on any new map. It only ADDS fields and can be re-run safely.
1. **Back up first** (Firestore > Import/Export, or `gcloud firestore export`).
2. On your own computer, in this folder: `npm install`
3. Set the service account for this terminal session only (do not save it in a file):
   - macOS/Linux: `export FIREBASE_SERVICE_ACCOUNT='<paste the JSON>'`
   - Windows PowerShell: `$env:FIREBASE_SERVICE_ACCOUNT='<paste the JSON>'`
4. Dry run (writes nothing): `npm run migrate`  - check the counts it prints.
5. Apply: `npm run migrate -- --apply`
6. Run step 5 again: it should report `usersUpdated: 0` and `paymentsUpdated: 0`.
Tested (simulated database): dry run writes nothing; buyers become `owned.atoll` and keep `premium`; payment amounts/statuses untouched; nothing deleted; second run changes nothing.

### Firestore data shape
- `users/{uid}`: `premium` (legacy, kept), `owned:{atoll,toy,third}`, `premiumAt`, `profile:{name,av,avs,pt}`
- `payments/{reference}`: `uid, email, item, maps, amount (kobo), currency, status (pending|superseded|fulfilled|failed), createdAt, paidAt, paystackId, granted, overlap, needsReview`
- Payments flagged `needsReview:true` mean a player paid for a map they already owned (e.g. two overlapping checkouts). Nothing was removed or double-granted; refund that payment from the Paystack dashboard.

## Releasing the premium maps
- **Toy World is built** (9 holes, `api/_toy.js`) but still **switched off for sale**. To launch it: (1) test a full purchase with your Paystack TEST key on a staging deploy, (2) set `enabled:true` for `toy` in `api/_catalog.js`, (3) set `LIVE.toy` to `true` in `index.html` so the menu card shows the price instead of "COMING SOON", (4) redeploy, (5) switch to the live Paystack key.
- The third premium map and the two bundles are not built yet. When the third map is ready: add its holes to `api/_maps.js` (key `third`), add its theme to the game, then enable `third`, `bundle_new` and `bundle_all` in `api/_catalog.js` (the bundles must stay disabled until BOTH maps exist).

## Tests and build
- `npm install` then `npm test` runs the payment/ownership/pricing/migration suite (no credentials needed).
- Production build: none required. Vercel serves `index.html` and deploys `api/` as functions.

## Future native Android / iOS releases (not in the web game)
- **Do not** use Paystack for digital maps inside native store apps. Apple (App Store Review Guideline 3.1.1) and Google Play payments policy require their own billing for digital content.
- iOS: StoreKit 2 in-app purchases (non-consumable products); validate transactions server-side with the App Store Server API. Android: Google Play Billing Library; validate purchase tokens server-side with the Google Play Developer API.
- Create one non-consumable product per item (`atoll`, `toy`, `third`, `bundle_new`, `bundle_all`) and map each to the same `owned.*` fields so a purchase on any platform unlocks the account everywhere. Provide "Restore purchases" in the apps (required by Apple).
- Store prices are set per store (local-currency tiers); they will not equal the Paystack NGN prices exactly. Bundle upgrade pricing for partial owners needs equivalent store products.
- Wrap the web game with Capacitor; use its Haptics plugin (already detected by the game), Game Center (iOS) and Google Play Games (Android) plugins, and require your Apple/Google developer accounts.

## Known limits
- Coins and owned balls are saved on the device (not server-verified or cloud-synced yet); balls are cosmetic only.
- Premium map data cached on a player's device lets paid players play offline, as is normal for offline games.
