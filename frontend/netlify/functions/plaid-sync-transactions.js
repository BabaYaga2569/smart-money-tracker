const PLAID_BASE_URLS = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com",
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders(),
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, {
      ok: false,
      error: "Method not allowed. Use POST.",
    });
  }

  const plaidEnv = process.env.PLAID_ENV || "sandbox";
  const baseUrl = PLAID_BASE_URLS[plaidEnv];

  if (!baseUrl) {
    return jsonResponse(500, {
      ok: false,
      error: `Invalid PLAID_ENV: ${plaidEnv}`,
    });
  }

  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;

  if (!clientId || !secret) {
    return jsonResponse(500, {
      ok: false,
      error: "Missing PLAID_CLIENT_ID or PLAID_SECRET",
    });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (error) {
    return jsonResponse(400, {
      ok: false,
      error: "Invalid JSON body.",
    });
  }

  const accessToken = body.access_token;
  const cursor = body.cursor || null;

  if (!accessToken) {
    return jsonResponse(400, {
      ok: false,
      error: "Missing access_token.",
    });
  }

  try {
    let added = [];
    let modified = [];
    let removed = [];
    let hasMore = true;
    let nextCursor = cursor;

    while (hasMore) {
      const response = await fetch(`${baseUrl}/transactions/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: clientId,
          secret,
          access_token: accessToken,
          cursor: nextCursor,
          count: 100,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return jsonResponse(response.status, {
          ok: false,
          plaidEnv,
          error:
            data.error_message ||
            data.error_code ||
            "Plaid transactions sync failed",
          plaid: data,
        });
      }

      added = added.concat(data.added || []);
      modified = modified.concat(data.modified || []);
      removed = removed.concat(data.removed || []);
      hasMore = Boolean(data.has_more);
      nextCursor = data.next_cursor;
    }

    return jsonResponse(200, {
      ok: true,
      plaidEnv,
      cursor: nextCursor,
      counts: {
        added: added.length,
        modified: modified.length,
        removed: removed.length,
      },
      transactions: added.map((tx) => ({
        transaction_id: tx.transaction_id,
        account_id: tx.account_id,
        date: tx.date,
        authorized_date: tx.authorized_date,
        name: tx.name,
        merchant_name: tx.merchant_name,
        amount: tx.amount,
        pending: tx.pending,
        payment_channel: tx.payment_channel,
        category: tx.category,
        personal_finance_category: tx.personal_finance_category,
      })),
    });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      plaidEnv,
      error: error.message,
    });
  }
}

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: corsHeaders(),
    body: JSON.stringify(body),
  };
}
