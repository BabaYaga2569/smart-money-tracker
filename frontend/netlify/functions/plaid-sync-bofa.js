const PLAID_BASE_URLS = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com",
};

const BANK_NAME = "BofA";
const TOKEN_ENV_NAME = "PLAID_BOFA_ACCESS_TOKEN";

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(), body: "" };
  }

  if (event.httpMethod !== "POST" && event.httpMethod !== "GET") {
    return jsonResponse(405, { ok: false, error: "Method not allowed." });
  }

  const plaidEnv = process.env.PLAID_ENV || "sandbox";
  const baseUrl = PLAID_BASE_URLS[plaidEnv];
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const accessToken = process.env[TOKEN_ENV_NAME];

  if (!baseUrl) {
    return jsonResponse(500, { ok: false, error: `Invalid PLAID_ENV: ${plaidEnv}` });
  }

  if (!clientId || !secret || !accessToken) {
    return jsonResponse(500, {
      ok: false,
      error: "Missing required Netlify environment variable.",
      hasClientId: Boolean(clientId),
      hasSecret: Boolean(secret),
      hasAccessToken: Boolean(accessToken),
      tokenEnvName: TOKEN_ENV_NAME,
    });
  }

  const input = parseInput(event);
  const cursor = input.cursor || null;
  const count = Number(input.count || 100);

  try {
    let added = [];
    let modified = [];
    let removed = [];
    let hasMore = true;
    let nextCursor = cursor;
    let loopCount = 0;

    while (hasMore && loopCount < 10) {
      loopCount++;

      const response = await fetch(`${baseUrl}/transactions/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          secret,
          access_token: accessToken,
          cursor: nextCursor,
          count,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return jsonResponse(response.status, {
          ok: false,
          plaidEnv,
          bankName: BANK_NAME,
          error: data.error_message || data.error_code || "Plaid transactions sync failed",
          plaid: data,
        });
      }

      added = added.concat(data.added || []);
      modified = modified.concat(data.modified || []);
      removed = removed.concat(data.removed || []);
      hasMore = Boolean(data.has_more);
      nextCursor = data.next_cursor;
    }

    const transactions = added.map((tx) => normalizeForSheets(tx));

    return jsonResponse(200, {
      ok: true,
      plaidEnv,
      bankName: BANK_NAME,
      cursor: nextCursor,
      cursor_received: Boolean(nextCursor),
      counts: {
        added: added.length,
        modified: modified.length,
        removed: removed.length,
      },
      transactions,
      removed_transaction_ids: removed.map((tx) => tx.transaction_id).filter(Boolean),
      note: "Access token is stored server-side in Netlify and is never returned.",
    });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      plaidEnv,
      bankName: BANK_NAME,
      error: error.message,
    });
  }
}

function parseInput(event) {
  if (event.httpMethod === "GET") {
    return event.queryStringParameters || {};
  }

  try {
    return JSON.parse(event.body || "{}");
  } catch (_error) {
    return {};
  }
}

function normalizeForSheets(tx) {
  const merchant = tx.merchant_name || tx.name || "Unknown Merchant";
  const suggestedCategory = mapCategory(tx);

  return {
    transaction_id: tx.transaction_id,
    date: tx.date,
    merchant,
    amount: tx.amount,
    bank: BANK_NAME,
    category: suggestedCategory,
    pending: Boolean(tx.pending),
    account_id: tx.account_id,
    authorized_date: tx.authorized_date || "",
    original_name: tx.name || "",
    payment_channel: tx.payment_channel || "",
    personal_finance_category: tx.personal_finance_category || null,
  };
}

function mapCategory(tx) {
  const primary = String(tx.personal_finance_category?.primary || "").toUpperCase();
  const detailed = String(tx.personal_finance_category?.detailed || "").toUpperCase();
  const name = String(tx.merchant_name || tx.name || "").toLowerCase();

  if (primary.includes("INCOME")) return "Income/Paycheck";
  if (primary.includes("FOOD_AND_DRINK")) return "Dining";
  if (primary.includes("GROCERIES")) return "Groceries";
  if (primary.includes("TRANSPORTATION") || detailed.includes("GAS")) return "Gas for Cars";
  if (primary.includes("GENERAL_MERCHANDISE")) return "Shopping";
  if (primary.includes("ENTERTAINMENT")) return "Entertainment";
  if (primary.includes("MEDICAL")) return "Health/Medical";
  if (primary.includes("LOAN_PAYMENTS")) return "Credit Card";
  if (primary.includes("RENT_AND_UTILITIES")) return "Utilities";
  if (primary.includes("TRANSFER")) return "Transfer Between Banks";

  if (name.includes("walmart") || name.includes("sams") || name.includes("sam's") || name.includes("costco")) return "Groceries";
  if (name.includes("amazon") || name.includes("target")) return "Shopping";
  if (name.includes("mcdonald") || name.includes("taco bell") || name.includes("starbucks")) return "Dining";
  if (name.includes("shell") || name.includes("chevron") || name.includes("circle k")) return "Gas for Cars";
  if (name.includes("payroll") || name.includes("paycheck")) return "Income/Paycheck";

  return "Needs Review";
}

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: corsHeaders(),
    body: JSON.stringify(body),
  };
}
