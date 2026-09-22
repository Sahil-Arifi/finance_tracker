import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const { SignJWT, generateKeyPair, exportJWK } = await import(require.resolve("jose"));
const { verifyPlaidWebhook } = require("./services/plaidWebhookVerification.js");
const now = new Date("2026-09-22T12:00:00Z");
const issued = now.getTime() / 1000;
const body = Buffer.from('{"webhook_type":"TRANSACTIONS","item_id":"item"}');
const { privateKey, publicKey } = await generateKeyPair("ES256");
const key = { ...(await exportJWK(publicKey)), kid: "test-key", alg: "ES256", expired_at: null };
const client = { webhookVerificationKeyGet: async ({ key_id }) => {
  assert.equal(key_id, "test-key");
  return { data: { key } };
} };

async function signed(payload = {}, signingKey = privateKey) {
  return new SignJWT({ request_body_sha256: createHash("sha256").update(body).digest("hex"), ...payload })
    .setProtectedHeader({ alg: "ES256", kid: "test-key" })
    .setIssuedAt(payload.iat ?? issued)
    .sign(signingKey);
}

test("accepts a valid Plaid signature and exact body", async () => {
  assert.equal(await verifyPlaidWebhook({ token: await signed(), rawBody: body, client, now }), true);
});

test("rejects modified bytes even if parsed JSON would be equivalent", async () => {
  assert.equal(await verifyPlaidWebhook({ token: await signed(), rawBody: Buffer.from(`${body}\n`), client, now }), false);
});

for (const iat of [issued - 301, issued + 60]) {
  test(`rejects stale or future timestamps: ${iat}`, async () => {
    assert.equal(await verifyPlaidWebhook({ token: await signed({ iat }), rawBody: body, client, now }), false);
  });
}

test("rejects forged signatures", async () => {
  const other = await generateKeyPair("ES256");
  assert.equal(await verifyPlaidWebhook({ token: await signed({}, other.privateKey), rawBody: body, client, now }), false);
});

test("rejects expired keys and malformed body hashes", async () => {
  const expiredClient = { webhookVerificationKeyGet: async () => ({ data: { key: { ...key, expired_at: issued - 1 } } }) };
  assert.equal(await verifyPlaidWebhook({ token: await signed(), rawBody: body, client: expiredClient, now }), false);
  assert.equal(await verifyPlaidWebhook({ token: await signed({ request_body_sha256: "invalid" }), rawBody: body, client, now }), false);
});

test("missing or unsupported headers and missing raw body fail closed", async () => {
  const neverFetch = { webhookVerificationKeyGet: () => { throw new Error("must not fetch"); } };
  assert.equal(await verifyPlaidWebhook({ rawBody: body, client: neverFetch, now }), false);
  assert.equal(await verifyPlaidWebhook({ token: "malformed", rawBody: body, client: neverFetch, now }), false);
  const unsupported = `${Buffer.from(JSON.stringify({ alg: "none", kid: "test-key" })).toString("base64url")}.e30.`;
  assert.equal(await verifyPlaidWebhook({ token: unsupported, rawBody: body, client: neverFetch, now }), false);
  assert.equal(await verifyPlaidWebhook({ token: await signed(), rawBody: undefined, client, now }), false);
});

test("verification service errors fail closed", async () => {
  const unavailable = { webhookVerificationKeyGet: async () => { throw new Error("unavailable"); } };
  assert.equal(await verifyPlaidWebhook({ token: await signed(), rawBody: body, client: unavailable, now }), false);
});

test("the deployed handler rejects unsigned requests before any database access", async () => {
  const handlers = {};
  let databaseCalls = 0;
  const modules = {
    dotenv: { config() {} },
    "firebase-admin": { initializeApp() {}, firestore() { databaseCalls += 1; throw new Error("unexpected database access"); } },
    "firebase-functions/v2/https": { onCall: (_, handler) => handler, onRequest: (_, handler) => handler, HttpsError: Error },
    "firebase-functions": { logger: { info() {}, warn() {}, error() {} } },
    "@google-cloud/vision": {},
    plaid: { Configuration: class {}, PlaidApi: class {}, PlaidEnvironments: { sandbox: "sandbox" } },
    "./receiptParse": {},
    "./services/openaiClient": {},
    "./services/plaidWebhookVerification": { verifyPlaidWebhook },
    "./services/plaidSync": {},
  };
  vm.runInNewContext(readFileSync(new URL("../functions/index.js", import.meta.url), "utf8"), {
    require: (name) => { if (!(name in modules)) throw new Error(`Unexpected import ${name}`); return modules[name]; },
    exports: handlers, Buffer, process: { env: { PLAID_CLIENT_ID: "test", PLAID_SECRET: "test" } },
  });
  const response = { status(code) { this.code = code; return this; }, send(message) { this.message = message; } };
  await handlers.plaidWebhook({ method: "POST", get: () => undefined, rawBody: body }, response);
  assert.equal(response.code, 401);
  assert.equal(databaseCalls, 0);
});
