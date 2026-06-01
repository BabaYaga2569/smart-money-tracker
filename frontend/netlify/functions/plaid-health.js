export async function handler() {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ok: true,
      functionName: "plaid-health",
      plaidEnv: process.env.PLAID_ENV || "not_set",
      hasClientId: Boolean(process.env.PLAID_CLIENT_ID),
      hasSecret: Boolean(process.env.PLAID_SECRET),
      timestamp: new Date().toISOString()
    })
  };
}
