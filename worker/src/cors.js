const DEFAULT_ALLOWED_HEADERS = [
  "authorization",
  "content-type",
  "x-promptly-client",
  "x-admin-token",
  "x-promptly-user-email",
  "x-promptly-google-access-token",
  "x-promptly-firebase-token",
  "x-promptly-google-id-token",
  "x-promptly-estimate-prompt-length",
  "x-promptly-estimate-instruction-length"
];

export function parseAllowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function isOriginAllowed(origin, allowedOrigins) {
  if (!origin) {
    return false;
  }
  return allowedOrigins.includes(origin);
}

export function createCorsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": DEFAULT_ALLOWED_HEADERS.join(", "),
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}

export function handlePreflight(request, allowedOrigins) {
  const origin = request.headers.get("Origin");
  if (!isOriginAllowed(origin, allowedOrigins)) {
    return new Response("Forbidden origin", { status: 403 });
  }
  const requestedHeaders = String(request.headers.get("Access-Control-Request-Headers") || "")
    .toLowerCase()
    .split(",")
    .map((header) => header.trim())
    .filter(Boolean);

  const hasDisallowedHeader = requestedHeaders.some(
    (header) => !DEFAULT_ALLOWED_HEADERS.includes(header)
  );
  if (hasDisallowedHeader) {
    return new Response("Disallowed headers", { status: 400 });
  }

  return new Response(null, {
    status: 204,
    headers: createCorsHeaders(origin)
  });
}
