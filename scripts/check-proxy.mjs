#!/usr/bin/env node

const [, , rawProxyUrl] = process.argv;
const testUrl = "https://postman-echo.com/get";

function fail(message, details) {
  const payload = {
    ok: false,
    message,
    ...(details ? { details } : {}),
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(1);
}

if (!rawProxyUrl) {
  fail("Missing proxy URL", {
    usage: "node scripts/check-proxy.mjs <proxy-url>",
  });
}

let proxyUrl;
try {
  proxyUrl = new URL(rawProxyUrl);
} catch {
  fail("Invalid URL");
}

if (proxyUrl.username || proxyUrl.password) {
  fail("Unsupported URL format for this app", {
    reason: "Embedded username/password are rejected by the frontend runtime",
  });
}

const requestUrl = new URL(proxyUrl.toString());
requestUrl.searchParams.set("destination", testUrl);

try {
  const response = await fetch(requestUrl, {
    headers: {
      accept: "application/json",
    },
  });

  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    // leave as null
  }

  if (!response.ok) {
    fail("Proxy endpoint responded with non-2xx status", {
      status: response.status,
      body: text.slice(0, 500),
    });
  }

  if (!data || data.url !== testUrl) {
    fail("Endpoint is reachable but does not match this app's proxy validation", {
      expectedUrl: testUrl,
      receivedUrl: data?.url ?? null,
      bodyPreview: text.slice(0, 500),
    });
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        message: "Proxy matches this app's validation shape",
        proxyUrl: proxyUrl.toString(),
        status: response.status,
      },
      null,
      2,
    )}\n`,
  );
} catch (error) {
  fail("Could not connect to proxy", {
    error: error instanceof Error ? error.message : String(error),
  });
}
