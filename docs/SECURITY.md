# Security and privacy

## Threat model (summary)

- **In transit**: Browser ↔ Firebase uses HTTPS. Plaid Link runs in Plaid’s hosted UI; tokens are exchanged on the server.
- **At rest (Firestore)**: Data in `users/{uid}/profile/*` is protected by [Firestore security rules](../firestore.rules): only the signed-in user can read/write their own profile documents.
- **Secrets**: Plaid client secret, Plaid webhook verification (if enabled), and similar values must be set as **environment variables on Cloud Functions**, never in `VITE_*` client env vars (those ship in the JavaScript bundle).

## What developers / operators can see

- Anyone with **Firebase project admin** (or backups) can read stored documents unless you add **client-side encryption (E2E)**. This app stores finance data as structured fields in Firestore by default.
- **Receipt images** attached to transactions are stored as data URLs in the finance document for sync; treat the Firebase project as sensitive.

## Optional hardening (not implemented by default)

- **End-to-end encryption**: Derive a key from a user passphrase (Web Crypto), encrypt `transactions` (or the whole finance payload) before `setDoc`, and decrypt on read. Implications: recovery, multi-device key distribution, and Plaid/webhook pipelines must respect ciphertext.
- **Field-level encryption** for `receiptImage` blobs to reduce exposure of raw images in Firestore.
- **Plaid webhook JWT verification** using Plaid’s verification keys (enable in production).

## Operational checklist

1. Restrict IAM on the GCP/Firebase project; use least privilege for humans and CI.
2. Enable **Vision API** only for the Functions service account used by receipt OCR.
3. Rotate Plaid keys if leaked; use separate Plaid environments (sandbox vs production).
4. Do not log full request bodies or receipt images in Functions `logger` in production.

