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

  if (event.httpMethod !== "POST" && event.httpMethod !== "GET") {
    return jsonResponse(405, {
      ok: false,
      error: "Method not allowed",
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

  const requestBody = {
    client_id: clientId,
    secret,
    client_name: "Our Monthly Bills",
    country_codes: ["US"],
    language: "en",
    user: {
      client_user_id: "steve-monthly-bills",
    },
    products: ["transactions"],
    transactions: {
      days_requested: 90,
    },
  };

  try {
    const response = await fetch(`${baseUrl}/link/token/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      return jsonResponse(response.status, {
        ok: false,
        plaidEnv,
        error: data.error_message || data.error_code || "Plaid link token create failed",
        plaid: data,
      });
    }

    return jsonResponse(200, {
      ok: true,
      plaidEnv,
      link_token: data.link_token,
      expiration: data.expiration,
      request_id: data.request_id,
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
