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

  const publicToken = body.public_token;

  if (!publicToken) {
    return jsonResponse(400, {
      ok: false,
      error: "Missing public_token.",
    });
  }

  try {
    const response = await fetch(`${baseUrl}/item/public_token/exchange`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        secret,
        public_token: publicToken,
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
          "Plaid public token exchange failed",
        plaid: data,
      });
    }

    return jsonResponse(200, {
      ok: true,
      plaidEnv,
      item_id: data.item_id,
      access_token: data.access_token,
      request_id: data.request_id,
      warning:
        "Treat access_token like a password. Do not share it in chat or screenshots.",
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
