const { createHash, timingSafeEqual } = require("node:crypto");

/** Verify Plaid's JWT against the exact raw HTTP body before trusting any fields. */
async function verifyPlaidWebhook({ token, rawBody, client, now = new Date() }) {
  if (typeof token !== "string" || !token || !Buffer.isBuffer(rawBody) || !client) return false;
  try {
    const { decodeProtectedHeader, importJWK, jwtVerify } = await import("jose");
    const header = decodeProtectedHeader(token);
    if (header.alg !== "ES256" || typeof header.kid !== "string" || !header.kid || header.kid.length > 256) {
      return false;
    }
    // Fetch from Plaid each time so revoked/expired keys are not accepted from a cache.
    const response = await client.webhookVerificationKeyGet({ key_id: header.kid });
    const key = response.data?.key;
    if (!key || key.kid !== header.kid || key.alg !== "ES256" || key.kty !== "EC" || key.crv !== "P-256") {
      return false;
    }
    if (key.expired_at != null && key.expired_at <= now.getTime() / 1000) return false;
    const publicKey = await importJWK(key, "ES256");
    const { payload } = await jwtVerify(token, publicKey, {
      algorithms: ["ES256"],
      maxTokenAge: "5 minutes",
      currentDate: now,
    });
    const claimedHash = payload.request_body_sha256;
    if (typeof claimedHash !== "string" || !/^[a-fA-F0-9]{64}$/.test(claimedHash)) return false;
    const actualHash = createHash("sha256").update(rawBody).digest();
    return timingSafeEqual(actualHash, Buffer.from(claimedHash, "hex"));
  } catch {
    return false;
  }
}

module.exports = { verifyPlaidWebhook };
