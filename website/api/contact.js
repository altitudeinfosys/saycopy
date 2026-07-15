const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const MAX_BODY_BYTES = 16_000;

function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

function getAllowedOrigins() {
  const defaults = [
    "https://saycopy.app",
    "https://www.saycopy.app",
    "https://saycopy.vercel.app",
  ];
  const configured = (process.env.CONTACT_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (process.env.VERCEL_URL) {
    defaults.push(`https://${process.env.VERCEL_URL}`);
  }

  if (process.env.VERCEL_ENV !== "production") {
    defaults.push("http://localhost:3000", "http://localhost:3001");
  }

  return new Set([...defaults, ...configured]);
}

function isAllowedOrigin(request) {
  const value = request.headers.origin || request.headers.referer;
  if (!value) return false;

  try {
    return getAllowedOrigins().has(new URL(value).origin);
  } catch {
    return false;
  }
}

function getClientIp(request) {
  const forwarded = request.headers["x-vercel-forwarded-for"] || request.headers["x-forwarded-for"];
  return String(forwarded || request.socket?.remoteAddress || "unknown").split(",")[0].trim();
}

function isRateLimited(key) {
  const now = Date.now();
  const current = rateLimitStore.get(key);

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  if (current.count >= RATE_LIMIT_MAX) return true;
  current.count += 1;
  return false;
}

function parseBody(request) {
  if (typeof request.body === "string") return JSON.parse(request.body);
  if (Buffer.isBuffer(request.body)) return JSON.parse(request.body.toString("utf8"));
  return request.body || {};
}

function cleanString(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Method not allowed." });
  }

  const contentLength = Number(request.headers["content-length"] || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return sendJson(response, 413, { error: "That message is too large." });
  }

  if (!isAllowedOrigin(request)) {
    return sendJson(response, 403, { error: "Invalid request origin." });
  }

  if (isRateLimited(getClientIp(request))) {
    return sendJson(response, 429, { error: "Too many messages. Please try again later." });
  }

  let body;
  try {
    body = parseBody(request);
  } catch {
    return sendJson(response, 400, { error: "Invalid request." });
  }

  const website = cleanString(body.website, 200);
  if (website) return sendJson(response, 200, { success: true });

  const name = cleanString(body.name, 80);
  const email = cleanString(body.email, 254).toLowerCase();
  const topic = cleanString(body.topic, 40);
  const message = cleanString(body.message, 4000);
  const startedAt = Number(body.startedAt);
  const elapsed = Date.now() - startedAt;
  const allowedTopics = new Set(["Support", "Privacy", "Feedback", "Other"]);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (name.length < 2) {
    return sendJson(response, 400, {
      error: "Enter a name with at least 2 characters.",
      field: "name",
    });
  }
  if (!validEmail) {
    return sendJson(response, 400, {
      error: "Enter a valid email address so we can reply.",
      field: "email",
    });
  }
  if (!allowedTopics.has(topic)) {
    return sendJson(response, 400, {
      error: "Select what we can help you with.",
      field: "topic",
    });
  }
  if (message.length < 10) {
    return sendJson(response, 400, {
      error: "Enter a message with at least 10 non-space characters.",
      field: "message",
    });
  }
  if (!Number.isFinite(startedAt) || elapsed > 24 * 60 * 60 * 1000) {
    return sendJson(response, 400, {
      error: "This form has expired. Refresh the page and try again.",
    });
  }
  if (elapsed < 1000) {
    return sendJson(response, 400, {
      error: "Please wait a moment, then send your message again.",
    });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const recipient = process.env.CONTACT_TO_EMAIL;
  const sender = process.env.CONTACT_FROM_EMAIL || "SayCopy <contact@saycopy.app>";

  if (!apiKey || !recipient) {
    console.error("SayCopy contact form is missing its email configuration.");
    return sendJson(response, 503, { error: "Contact is temporarily unavailable. Please try again later." });
  }

  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeTopic = escapeHtml(topic);
  const safeMessage = escapeHtml(message).replace(/\n/g, "<br />");

  let resendResponse;
  try {
    resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: sender,
        to: [recipient],
        reply_to: email,
        subject: `[SayCopy ${topic}] Message from ${name.replace(/[\r\n]/g, " ")}`,
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.6;color:#111827;max-width:640px;margin:auto">
            <h1 style="font-size:24px">New SayCopy contact</h1>
            <p><strong>From:</strong> ${safeName}</p>
            <p><strong>Reply to:</strong> ${safeEmail}</p>
            <p><strong>Topic:</strong> ${safeTopic}</p>
            <div style="margin-top:24px;padding:20px;background:#f3f4f6;border-radius:12px">${safeMessage}</div>
            <p style="margin-top:24px;color:#6b7280;font-size:13px">Sent from the contact form at saycopy.app.</p>
          </div>`,
        text: `New SayCopy contact\n\nFrom: ${name}\nReply to: ${email}\nTopic: ${topic}\n\n${message}`,
      }),
    });
  } catch (error) {
    console.error("Resend could not be reached for a SayCopy contact message:", error);
    return sendJson(response, 502, { error: "We could not send your message. Please try again." });
  }

  if (!resendResponse.ok) {
    const resendError = await resendResponse.text();
    console.error("Resend rejected a SayCopy contact message:", resendResponse.status, resendError);
    return sendJson(response, 502, { error: "We could not send your message. Please try again." });
  }

  return sendJson(response, 200, { success: true });
};
