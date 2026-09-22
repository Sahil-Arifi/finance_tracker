require("dotenv").config();

const admin = require("firebase-admin");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");

const vision = require("@google-cloud/vision");
const { Configuration, PlaidApi, PlaidEnvironments } = require("plaid");
const { parseReceiptText } = require("./receiptParse");
const { generateFinanceAnswer } = require("./services/openaiClient");
const { verifyPlaidWebhook } = require("./services/plaidWebhookVerification");
const { collectPlaidUpdates, persistPlaidUpdates } = require("./services/plaidSync");

admin.initializeApp();

const FINANCE_KEYWORDS = [
  "budget",
  "spend",
  "spending",
  "expense",
  "expenses",
  "income",
  "cash flow",
  "saving",
  "savings",
  "debt",
  "loan",
  "credit",
  "subscription",
  "bill",
  "bills",
  "emergency fund",
  "net worth",
  "payoff",
  "invest",
  "investment",
  "retirement",
  "finance",
  "financial",
  "money",
  "dollar",
  "balance",
  "account",
  "accounts",
  "transaction",
  "transactions",
  "category",
  "categories",
  "summary",
  "summarize",
  "overview",
  "report",
  "breakdown",
  "trend",
  "trends",
  "compare",
  "comparison",
  "analysis",
  "analyze",
  "insight",
  "insights",
  "forecast",
  "estimate",
  "projection",
  "goal",
  "goals",
  "chart",
  "merchant",
  "receipt",
  "plaid",
  "bank",
  "banks",
  "card",
  "cards",
  "wallet",
  "cash",
  "deposit",
  "withdraw",
  "transfer",
  "refund",
  "fee",
  "fees",
  "tip",
  "salary",
  "wage",
  "rent",
  "mortgage",
  "interest",
  "apr",
  "tax",
  "deduct",
  "portfolio",
  "dividend",
  "equity",
  "asset",
  "liabilit",
  "profit",
  "loss",
  "revenue",
  "cost",
  "paid",
  "earn",
  "earned",
  "saved",
  "owe",
  "payment",
  "crypto",
  "bitcoin",
  "stock",
  "stocks",
  "bond",
  "etf",
  "forex",
  "option",
];

/** Month / year / summary-style questions should pass without matching a fixed keyword list. */
const MONTH_NAME_SUBSTRINGS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

const FINANCE_INTENT_REGEX =
  /\b(summary|summarize|overview|report|breakdown|total|totals|average|mean|median|net|gross|balance|balances|transaction|transactions|account|accounts|category|categories|compare|trend|analysis|insight|forecast|estimate|projection|goal|goals|chart|spending|spent|earn|earned|saved|save|owe|owed|pay|payment|split|splits|receipt|receipts|sync|import|export|csv|month|quarter|year|weekly|daily|ytd|mtd)\b/i;

function isFinanceQuestion(input) {
  const text = String(input || "").toLowerCase();
  if (!text) return false;
  if (FINANCE_KEYWORDS.some((kw) => text.includes(kw))) return true;
  if (/\b20\d{2}\b/.test(text)) return true;
  if (MONTH_NAME_SUBSTRINGS.some((m) => text.includes(m))) return true;
  if (FINANCE_INTENT_REGEX.test(text)) return true;
  return false;
}

function wordCount(text) {
  const tokens = String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return tokens.length;
}

function trimToWordLimit(text, maxWords = 150) {
  const words = String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return `${words.slice(0, maxWords).join(" ")}...`;
}

function enforceBulletWordLimit(text, maxWords = 150) {
  const raw = String(text || "").trim();
  if (!raw) return "";

  const lines = raw.split(/\r?\n/).map((l) => l.trim());
  const bullets = lines.filter((l) => l.startsWith("- "));
  const list = bullets.length ? bullets : raw.split(/\r?\n/).filter(Boolean).map((l) => `- ${l.trim()}`);

  let used = 0;
  const out = [];

  for (const line of list) {
    const body = line.replace(/^-+\s*/, "").trim();
    if (!body) continue;
    const words = body.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    if (used >= maxWords) break;
    const remaining = maxWords - used;

    const slice = words.slice(0, remaining);
    used += slice.length;
    out.push(`- ${slice.join(" ")}${slice.length < words.length ? "..." : ""}`);
    if (used >= maxWords) break;
  }

  return out.join("\n");
}

function formatToBullets(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";

  const refusal = "I can only help with your personal finance questions.";
  if (raw === refusal) return raw;

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const bulletLines = lines.filter((l) => /^[-*•]\s+/.test(l));
  let bullets = [];

  if (bulletLines.length > 0) {
    bullets = bulletLines.map((l) => l.replace(/^[-*•]\s+/, "").trim()).filter(Boolean);
  } else {
    // Convert short paragraphs/sentences into bullets.
    const sentences = raw
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    bullets = sentences.length > 0 ? sentences : [raw];
  }

  bullets = bullets.map((b) => b.replace(/^\s*[-*•]\s+/, "").trim()).filter(Boolean).slice(0, 5);
  return bullets.map((b) => `- ${b}`).join("\n");
}

function monthKey(isoDate) {
  return String(isoDate || "").slice(0, 7);
}

function buildFinanceSummary(financeDoc = {}) {
  const transactions = Array.isArray(financeDoc.transactions) ? financeDoc.transactions : [];
  const accounts = Array.isArray(financeDoc.accounts) ? financeDoc.accounts : [];
  const goals = Array.isArray(financeDoc.goals) ? financeDoc.goals : [];

  const byMonth = {};
  const byCategory = {};
  const subscriptionHints = {};
  const sortedRecent = [...transactions]
    .filter((t) => t?.date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 120);

  let income30d = 0;
  let expense30d = 0;
  const today = new Date();
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - 30);

  for (const tx of sortedRecent) {
    const amount = Number(tx?.amount) || 0;
    if (amount <= 0) continue;
    const type = tx?.type === "income" ? "income" : "expense";
    const month = monthKey(tx?.date);
    const category = String(tx?.category || "other").toLowerCase();

    if (!byMonth[month]) byMonth[month] = { income: 0, expense: 0 };
    byMonth[month][type] += amount;
    byCategory[category] = (byCategory[category] || 0) + (type === "expense" ? amount : 0);

    const txDate = new Date(tx?.date || "");
    if (!Number.isNaN(txDate.getTime()) && txDate >= cutoff) {
      if (type === "income") income30d += amount;
      else expense30d += amount;
    }

    const desc = String(tx?.description || "").trim().toLowerCase();
    if (type === "expense" && desc) {
      subscriptionHints[desc] = (subscriptionHints[desc] || 0) + 1;
    }
  }

  const topExpenseCategories = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category, amount]) => ({ category, amount: Math.round(amount) }));

  const recurringCandidates = Object.entries(subscriptionHints)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name]) => name);

  const accountBalanceTotal = accounts.reduce((sum, acc) => sum + (Number(acc?.balance) || 0), 0);

  return {
    transactionCount: transactions.length,
    recentTransactionCount: sortedRecent.length,
    income30d: Math.round(income30d),
    expense30d: Math.round(expense30d),
    net30d: Math.round(income30d - expense30d),
    accountBalanceTotal: Math.round(accountBalanceTotal),
    accountCount: accounts.length,
    goalsCount: goals.length,
    topExpenseCategories,
    recurringCandidates,
    monthlyTotals: byMonth,
  };
}

function mapPlaidPrimaryToCategory(primary) {
  const p = String(primary || "").toUpperCase();
  if (p.includes("FOOD") || p.includes("RESTAURANTS")) return "food";
  if (p.includes("TRANSPORT")) return "transport";
  if (p.includes("ENTERTAINMENT")) return "entertainment";
  if (p.includes("RENT") || p.includes("UTILITIES") || p.includes("HOME")) return "housing";
  if (p.includes("GENERAL_MERCHANDISE") || p.includes("SHOPS")) return "other";
  return "other";
}

/** Map Plaid PFC to app income categories. */
function mapPlaidIncomeCategory(pfc) {
  const d = String(pfc?.detailed || "").toUpperCase();
  if (d.includes("INTEREST") || d.includes("DIVIDEND") || d.includes("CAPITAL_GAINS")) return "investment";
  if (d.includes("SALARY") || d.includes("PAYROLL") || d.includes("WAGE")) return "salary";
  if (d.includes("REFUND") || d.includes("REIMBURSEMENT")) return "refund";
  if (d.includes("FREELANCE") || d.includes("GIG")) return "freelance";
  if (d.includes("GIFT")) return "gift";
  return "other";
}

/**
 * Plaid: negative amount = inflow to depository; positive = outflow.
 * PFC INCOME / TRANSFER_IN often marks payroll & deposits even when sign is ambiguous in sandbox.
 */
function isPlaidIncomeTransaction(t) {
  const raw = Number(t.amount) || 0;
  const pfc = t.personal_finance_category || {};
  const primary = String(pfc.primary || "").toUpperCase();
  const detailed = String(pfc.detailed || "").toUpperCase();
  if (primary === "INCOME") return true;
  if (primary === "TRANSFER_IN") return true;
  if (detailed.includes("INCOME") && primary !== "TRANSFER_OUT") return true;
  return raw < 0;
}

/** Aligns with client App.jsx: drop Plaid rows for an item, including legacy rows without plaidItemId. */
function transactionBelongsToPlaidItemServer(t, itemId, institutionName) {
  if (!t || !itemId) return false;
  if (String(t.plaidItemId || "") === String(itemId)) return true;
  const inst = String(institutionName || "").trim();
  if (!inst) return false;
  const idStr = String(t.id ?? "");
  const fromPlaid = t.source === "plaid" || idStr.startsWith("plaid-");
  if (!fromPlaid) return false;
  const pm = String(t.paymentMethod || "").toLowerCase();
  if (!pm.includes("plaid")) return false;
  return pm.includes(inst.toLowerCase());
}

async function removePlaidItemFromFinanceDoc(uid, itemId, institutionName) {
  const financeRef = admin.firestore().doc(`users/${uid}/profile/finance`);
  await admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(financeRef);
    const d = snap.exists ? snap.data() : {};
    const txs = Array.isArray(d.transactions) ? d.transactions : [];
    const nextTx = txs.filter((t) => !transactionBelongsToPlaidItemServer(t, itemId, institutionName));
    const linked = Array.isArray(d.linkedPlaidItems) ? d.linkedPlaidItems : [];
    const nextLinked = linked.filter((x) => String(x.itemId) !== String(itemId));
    const accounts = Array.isArray(d.accounts) ? d.accounts : [];
    const nextAccounts = accounts.filter((a) => String(a?.plaidItemId || "") !== String(itemId));
    tx.set(
      financeRef,
      {
        transactions: nextTx,
        linkedPlaidItems: nextLinked,
        accounts: nextAccounts,
      },
      { merge: true }
    );
  });
}

function plaidTransactionToRow(t, institutionName, paymentMethodLabel, itemId) {
  const raw = Number(t.amount) || 0;
  const amount = Math.abs(raw);
  if (amount <= 0) return null;
  const income = isPlaidIncomeTransaction(t);
  const pfc = t.personal_finance_category;
  const primary = pfc?.primary || "";
  const category = income ? mapPlaidIncomeCategory(pfc) : mapPlaidPrimaryToCategory(primary);
  const label =
    paymentMethodLabel != null && String(paymentMethodLabel).length > 0
      ? String(paymentMethodLabel)
      : `${institutionName} (Plaid)`;
  return {
    id: `plaid-${t.transaction_id}`,
    description: (t.merchant_name || t.name || (income ? "Income" : "Purchase")).trim(),
    amount,
    type: income ? "income" : "expense",
    category,
    paymentMethod: label,
    date: t.date || new Date().toISOString().slice(0, 10),
    source: "plaid",
    ...(itemId ? { plaidItemId: itemId } : {}),
    ...(t.account_id ? { plaidAccountId: t.account_id } : {}),
    plaidTransactionId: t.transaction_id,
    userEdited: false,
  };
}

function getPlaidClient() {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const env = process.env.PLAID_ENV || "sandbox";
  if (!clientId || !secret) return null;
  const configuration = new Configuration({
    basePath: PlaidEnvironments[env] || PlaidEnvironments.sandbox,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
        "Plaid-Version": "2020-09-14",
      },
    },
  });
  return new PlaidApi(configuration);
}

function plaidAccessRef(uid, itemId) {
  return admin.firestore().collection("users").doc(uid).collection("plaidAccess").doc(itemId);
}

function itemLookupRef(itemId) {
  return admin.firestore().collection("plaidItemLookup").doc(itemId);
}

exports.scanReceipt = onCall({ region: "us-central1", memory: "512MiB" }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required for receipt scan.");
  }
  const { imageBase64 } = request.data || {};
  if (!imageBase64 || typeof imageBase64 !== "string") {
    throw new HttpsError("invalid-argument", "imageBase64 required.");
  }
  const raw = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;
  let buffer;
  try {
    buffer = Buffer.from(raw, "base64");
  } catch {
    throw new HttpsError("invalid-argument", "Invalid image data.");
  }
  if (buffer.length > 12 * 1024 * 1024) {
    throw new HttpsError("invalid-argument", "Image too large.");
  }

  const client = new vision.ImageAnnotatorClient();
  let text = "";
  try {
    const [result] = await client.textDetection({ image: { content: buffer } });
    text = result.fullTextAnnotation?.text || "";
    if (!text && result.textAnnotations?.length) {
      text = result.textAnnotations.map((a) => a.description).join("\n");
    }
  } catch (e) {
    logger.error("Vision OCR failed", e);
    const code = e && typeof e === "object" && "code" in e ? Number(e.code) : NaN;
    const msg = String(e && e.message ? e.message : e);
    const permissionLike =
      code === 7 ||
      /PERMISSION_DENIED|Cloud Vision API has not been used|SERVICE_DISABLED|API has not been enabled|billing/i.test(
        msg
      );
    if (permissionLike) {
      throw new HttpsError(
        "failed-precondition",
        "Enable the Cloud Vision API on the same Google Cloud project as Firebase (Google Cloud Console → APIs & Services → Library → “Cloud Vision API” → Enable). Billing must be on. Then redeploy functions if needed."
      );
    }
    throw new HttpsError(
      "internal",
      "Receipt scan failed (OCR). Try a sharper, well-lit photo, or confirm Vision API is enabled for this project."
    );
  }

  const parsed = parseReceiptText(text);
  return {
    text: text.slice(0, 4000),
    total: parsed.total,
    merchant: parsed.merchant,
    date: parsed.date ?? null,
  };
});

exports.createPlaidLinkToken = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const client = getPlaidClient();
  if (!client) {
    throw new HttpsError("failed-precondition", "Plaid is not configured on the server.");
  }
  const uid = request.auth.uid;
  try {
    const res = await client.linkTokenCreate({
      user: { client_user_id: uid },
      client_name: "ExpensePilot",
      products: ["transactions"],
      country_codes: ["US"],
      language: "en",
    });
    return { linkToken: res.data.link_token };
  } catch (e) {
    logger.error("linkTokenCreate", e);
    throw new HttpsError("internal", e?.response?.data?.error_message || "Could not create link token.");
  }
});

exports.exchangePlaidPublicToken = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const { publicToken } = request.data || {};
  if (!publicToken) {
    throw new HttpsError("invalid-argument", "publicToken required.");
  }
  const client = getPlaidClient();
  if (!client) {
    throw new HttpsError("failed-precondition", "Plaid is not configured.");
  }
  const uid = request.auth.uid;
  try {
    const exchange = await client.itemPublicTokenExchange({ public_token: publicToken });
    const accessToken = exchange.data.access_token;
    const itemId = exchange.data.item_id;
    await plaidAccessRef(uid, itemId).set({
      accessToken,
      cursor: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await itemLookupRef(itemId).set({ uid });

    let institutionName = "Linked account";
    let mask = "";
    try {
      const itemRes = await client.itemGet({ access_token: accessToken });
      const item = itemRes.data.item;
      mask = item?.mask || "";
      const instId = item?.institution_id;
      if (instId) {
        const inst = await client.institutionsGetById({ institution_id: instId, country_codes: ["US"] });
        institutionName = inst.data.institution?.name || institutionName;
      }
    } catch (e) {
      logger.warn("itemGet optional", e?.message);
    }

    return {
      itemId,
      institutionName,
      mask,
    };
  } catch (e) {
    logger.error("exchangePlaidPublicToken", e);
    throw new HttpsError("internal", e?.response?.data?.error_message || "Could not link account.");
  }
});

exports.removePlaidItem = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const uid = request.auth.uid;
  const itemId = request.data?.itemId;
  if (!itemId || typeof itemId !== "string" || itemId.length > 128) {
    throw new HttpsError("invalid-argument", "itemId required.");
  }
  const client = getPlaidClient();
  if (!client) {
    throw new HttpsError("failed-precondition", "Plaid is not configured.");
  }

  const accessDoc = await plaidAccessRef(uid, itemId).get();
  if (!accessDoc.exists) {
    await itemLookupRef(itemId).delete().catch(() => {});
    try {
      await removePlaidItemFromFinanceDoc(uid, itemId, "");
    } catch (e) {
      logger.error("removePlaidItem finance cleanup (missing access)", e);
    }
    return { removed: true, alreadyMissing: true };
  }
  const { accessToken } = accessDoc.data() || {};
  if (!accessToken) {
    await plaidAccessRef(uid, itemId).delete().catch(() => {});
    await itemLookupRef(itemId).delete().catch(() => {});
    try {
      await removePlaidItemFromFinanceDoc(uid, itemId, "");
    } catch (e) {
      logger.error("removePlaidItem finance cleanup (no token)", e);
    }
    return { removed: true, alreadyMissing: true };
  }

  let institutionName = "";
  try {
    const itemRes = await client.itemGet({ access_token: accessToken });
    const instId = itemRes.data.item?.institution_id;
    if (instId) {
      const inst = await client.institutionsGetById({ institution_id: instId, country_codes: ["US"] });
      institutionName = inst.data.institution?.name || "";
    }
  } catch (e) {
    logger.warn("removePlaidItem itemGet", e?.message);
  }

  try {
    await client.itemRemove({ access_token: accessToken });
  } catch (e) {
    logger.error("removePlaidItem itemRemove", itemId, e?.response?.data || e);
    throw new HttpsError("internal", e?.response?.data?.error_message || "Could not remove bank connection.");
  }

  await plaidAccessRef(uid, itemId).delete().catch(() => {});
  await itemLookupRef(itemId).delete().catch(() => {});

  try {
    await removePlaidItemFromFinanceDoc(uid, itemId, institutionName);
  } catch (e) {
    logger.error("removePlaidItem finance cleanup", e);
  }

  return { removed: true };
});

exports.syncPlaidTransactions = onCall({ region: "us-central1", memory: "512MiB" }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const uid = request.auth.uid;
  const client = getPlaidClient();
  if (!client) {
    throw new HttpsError("failed-precondition", "Plaid is not configured.");
  }

  const snap = await admin.firestore().collection("users").doc(uid).collection("plaidAccess").get();
  if (snap.empty) {
    return { transactions: [], linkedPlaidItems: [] };
  }

  const newTransactions = [];
  const plaidUpdates = [];
  const removedTransactionIds = [];
  const linkedItemsMeta = [];
  const failedItemIds = [];

  for (const docSnap of snap.docs) {
    const itemId = docSnap.id;
    const { accessToken, cursor: prevCursor } = docSnap.data();
    if (!accessToken) continue;

    let institutionName = "Linked card";
    let mask = "";
    try {
      const itemRes = await client.itemGet({ access_token: accessToken });
      const instId = itemRes.data.item?.institution_id;
      mask = itemRes.data.item?.mask || "";
      if (instId) {
        const inst = await client.institutionsGetById({ institution_id: instId, country_codes: ["US"] });
        institutionName = inst.data.institution?.name || institutionName;
      }
    } catch (e) {
      logger.warn("itemGet before sync", e?.message);
    }

    try {
      const updates = await collectPlaidUpdates(client, accessToken, prevCursor, (t) =>
        plaidTransactionToRow(t, institutionName, `${institutionName} (Plaid)`, itemId)
      );
      await persistPlaidUpdates({
        db: admin.firestore(),
        accessRef: plaidAccessRef(uid, itemId),
        financeRef: admin.firestore().doc(`users/${uid}/profile/finance`),
        accessToken,
        startCursor: prevCursor,
        updates,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      newTransactions.push(...updates.added);
      plaidUpdates.push(...updates.modified);
      removedTransactionIds.push(...updates.removed);

      linkedItemsMeta.push({
        itemId,
        institutionName,
        mask,
        lastSyncedAt: new Date().toISOString(),
      });
    } catch (e) {
      logger.error("transactionsSync", itemId, e);
      failedItemIds.push(itemId);
    }
  }

  return { transactions: newTransactions, plaidUpdates, removedTransactionIds, linkedPlaidItems: linkedItemsMeta, failedItemIds };
});

exports.chatFinance = onCall({ region: "us-central1", memory: "512MiB" }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }

  const prompt = String(request.data?.prompt || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);

  if (!prompt) {
    throw new HttpsError("invalid-argument", "Prompt is required.");
  }

  if (!isFinanceQuestion(prompt)) {
    return { answer: "I can only help with your personal finance questions." };
  }

  const uid = request.auth.uid;
  const financeRef = admin.firestore().doc(`users/${uid}/profile/finance`);
  const snap = await financeRef.get();
  const financeData = snap.exists ? snap.data() : {};
  const summary = buildFinanceSummary(financeData);

  if (!summary.transactionCount && !summary.accountCount && !summary.goalsCount) {
    return { answer: "I do not have enough financial data yet. Add transactions or account balances, then ask again." };
  }

  let answer = "";
  try {
    answer = await generateFinanceAnswer({
      userPrompt: prompt,
      financeSummary: summary,
    });
  } catch (e) {
    logger.error("chatFinance failure", e);
    throw new HttpsError("internal", "Could not generate a finance answer right now.");
  }

  const bulletAnswer = formatToBullets(answer || "");
  const safeAnswer = enforceBulletWordLimit(bulletAnswer || "", 150);
  if (!safeAnswer) {
    return { answer: "I do not have enough data to answer that clearly yet." };
  }

  return {
    answer: safeAnswer,
    meta: {
      words: wordCount(safeAnswer),
      usedTransactions: summary.recentTransactionCount,
    },
  };
});

exports.plaidWebhook = onRequest({ region: "us-central1" }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }
  const client = getPlaidClient();
  if (!client) {
    res.status(503).send("Plaid is not configured");
    return;
  }
  const verified = await verifyPlaidWebhook({
    token: req.get("Plaid-Verification"),
    rawBody: req.rawBody,
    client,
  });
  if (!verified) {
    res.status(401).send("Invalid webhook signature");
    return;
  }
  let body;
  try {
    body = JSON.parse(req.rawBody.toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid body");
  } catch {
    res.status(400).send("Invalid webhook body");
    return;
  }
  const { webhook_type: webhookType, item_id: itemId } = body;
  logger.info("plaidWebhook", webhookType, itemId);

  if (webhookType === "TRANSACTIONS" && typeof itemId === "string" && itemId && !itemId.includes("/")) {
    const lookup = await itemLookupRef(itemId).get();
    if (!lookup.exists) {
      res.status(200).send("ok");
      return;
    }
    const { uid } = lookup.data();
    if (!uid) {
      res.status(200).send("ok");
      return;
    }
    try {
      const accessDoc = await plaidAccessRef(uid, itemId).get();
      if (!accessDoc.exists) {
        res.status(200).send("ok");
        return;
      }
      const { accessToken, cursor: prevCursor } = accessDoc.data();
      if (!accessToken) {
        res.status(200).send("ok");
        return;
      }
      let institutionName = "Linked account";
      try {
        const itemRes = await client.itemGet({ access_token: accessToken });
        const instId = itemRes.data.item?.institution_id;
        if (instId) {
          const inst = await client.institutionsGetById({ institution_id: instId, country_codes: ["US"] });
          institutionName = inst.data.institution?.name || institutionName;
        }
      } catch (e) {
        logger.warn("webhook itemGet", e?.message);
      }
      const payLabel = `${institutionName} (Plaid)`;
      const updates = await collectPlaidUpdates(client, accessToken, prevCursor, (t) =>
        plaidTransactionToRow(t, institutionName, payLabel, itemId)
      );
      await persistPlaidUpdates({
        db: admin.firestore(),
        accessRef: plaidAccessRef(uid, itemId),
        financeRef: admin.firestore().doc(`users/${uid}/profile/finance`),
        accessToken,
        startCursor: prevCursor,
        updates,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      logger.error("webhook sync failed", e);
      res.status(500).send("Sync failed; retry later");
      return;
    }
  }

  res.status(200).send("ok");
});

