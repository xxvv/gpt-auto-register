const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "authorization, content-type"
};

const TEXT_HEADERS = {
  "content-type": "text/plain; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*"
};

const RAW_EMAIL_MAX_BYTES = 900000;
const BODY_MAX_BYTES = 300000;
const RECENT_CODE_WINDOW_MS = 5 * 60 * 1000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: JSON_HEADERS });
    }

    if (!isAuthorized(request, env, url)) {
      return json({ error: "unauthorized" }, 401);
    }

    try {
      if (request.method !== "GET") {
        return json({ error: "method_not_allowed" }, 405);
      }

      if (url.pathname === "/" || url.pathname === "/inbox") {
        return new Response(renderInboxPage(), {
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }
        });
      }

      if (url.pathname === "/api/messages") {
        return handleListMessages(url, env);
      }

      const detailMatch = url.pathname.match(/^\/api\/messages\/(\d+)$/);
      if (detailMatch) {
        return handleMessageDetail(detailMatch[1], env);
      }

      if (
        url.pathname === "/api/code" ||
        url.pathname === "/api/verification-code" ||
        url.pathname === "/api/latest-code"
      ) {
        return handleLatestCode(url, env);
      }

      if (url.pathname === "/api/recipients") {
        return handleRecipients(env);
      }

      return json({ error: "not_found" }, 404);
    } catch (error) {
      return json({ error: "internal_error", message: String(error && error.message ? error.message : error) }, 500);
    }
  },

  async email(message, env) {
    const rawEmail = await streamToString(message.raw);
    const rawSize = Number.isFinite(message.rawSize) ? message.rawSize : byteLength(rawEmail);
    const parsed = parseMimeMessage(rawEmail);
    const headers = parsed.headers;

    const sender = normalizeEmail(message.from || headers.from || "");
    const recipient = normalizeEmail(message.to || headers.to || "");
    const subject = headers.subject || "";
    const messageId = headers["message-id"] || null;
    const dateHeader = headers.date || null;
    const textBody = truncateUtf8(parsed.text || htmlToText(parsed.html || ""), BODY_MAX_BYTES);
    const htmlBody = truncateUtf8(parsed.html || "", BODY_MAX_BYTES);
    const rawStored = truncateUtf8(rawEmail, RAW_EMAIL_MAX_BYTES);
    const rawTruncated = rawSize > byteLength(rawStored) ? 1 : 0;
    const verificationCode = extractVerificationCode([subject, textBody, htmlToText(htmlBody)].join("\n"));

    if (!recipient) {
      throw new Error("Recipient email address is empty.");
    }

    await env.DB.prepare(
      `INSERT OR IGNORE INTO email_messages (
        message_id,
        sender,
        sender_lc,
        recipient,
        recipient_lc,
        subject,
        date_header,
        received_at,
        raw_size,
        raw_truncated,
        text_body,
        html_body,
        raw_email,
        verification_code
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        messageId,
        sender || null,
        sender ? sender.toLowerCase() : null,
        recipient,
        recipient.toLowerCase(),
        subject,
        dateHeader,
        Date.now(),
        rawSize,
        rawTruncated,
        textBody,
        htmlBody,
        rawStored,
        verificationCode
      )
      .run();
  }
};

async function handleListMessages(url, env) {
  const email = normalizeEmail(url.searchParams.get("email") || "");
  const limit = clampInt(url.searchParams.get("limit"), 1, 100, 50);

  let query = `
    SELECT
      id,
      sender,
      recipient,
      subject,
      received_at,
      raw_size,
      raw_truncated,
      verification_code,
      substr(COALESCE(NULLIF(text_body, ''), html_body, ''), 1, 260) AS preview
    FROM email_messages
  `;
  const params = [];

  if (email) {
    query += " WHERE recipient_lc = ?";
    params.push(email.toLowerCase());
  }

  query += " ORDER BY received_at DESC LIMIT ?";
  params.push(limit);

  const result = await env.DB.prepare(query).bind(...params).all();
  return json({ messages: result.results || [] });
}

async function handleMessageDetail(id, env) {
  const row = await env.DB.prepare(
    `SELECT
      id,
      message_id,
      sender,
      recipient,
      subject,
      date_header,
      received_at,
      raw_size,
      raw_truncated,
      text_body,
      html_body,
      raw_email,
      verification_code,
      created_at
    FROM email_messages
    WHERE id = ?`
  )
    .bind(Number(id))
    .first();

  if (!row) {
    return json({ error: "not_found" }, 404);
  }

  return json({ message: row });
}

async function handleLatestCode(url, env) {
  const email = normalizeEmail(url.searchParams.get("email") || "");
  const format = (url.searchParams.get("format") || "text").toLowerCase();

  if (!email) {
    return format === "json"
      ? json({ error: "missing_email" }, 400)
      : new Response("missing_email", { status: 400, headers: TEXT_HEADERS });
  }

  const cutoff = Date.now() - RECENT_CODE_WINDOW_MS;
  const result = await env.DB.prepare(
    `SELECT
      id,
      sender,
      recipient,
      subject,
      received_at,
      text_body,
      html_body,
      verification_code
    FROM email_messages
    WHERE recipient_lc = ? AND received_at >= ?
    ORDER BY received_at DESC
    LIMIT 20`
  )
    .bind(email.toLowerCase(), cutoff)
    .all();

  for (const row of result.results || []) {
    const code = row.verification_code || extractVerificationCode([row.subject, row.text_body, htmlToText(row.html_body)].join("\n"));
    if (code) {
      if (format === "json") {
        return json({
          email,
          code,
          id: row.id,
          subject: row.subject,
          sender: row.sender,
          received_at: row.received_at
        });
      }

      return new Response(code, { headers: TEXT_HEADERS });
    }
  }

  return format === "json"
    ? json({ error: "code_not_found", email, window_seconds: RECENT_CODE_WINDOW_MS / 1000 }, 404)
    : new Response("code_not_found", { status: 404, headers: TEXT_HEADERS });
}

async function handleRecipients(env) {
  const result = await env.DB.prepare(
    `SELECT
      recipient,
      COUNT(*) AS message_count,
      MAX(received_at) AS latest_received_at
    FROM email_messages
    GROUP BY recipient_lc
    ORDER BY latest_received_at DESC
    LIMIT 200`
  ).all();

  return json({ recipients: result.results || [] });
}

function renderInboxPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Worker Mailbox</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f7fb;
      --panel: #ffffff;
      --line: #d9e1ec;
      --text: #18212f;
      --muted: #657386;
      --accent: #0f766e;
      --accent-weak: #d9f3ef;
      --danger: #b42318;
      --shadow: 0 14px 36px rgba(21, 31, 45, 0.08);
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font: 14px/1.45 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
    }
    button, input {
      font: inherit;
    }
    button {
      border: 1px solid var(--line);
      background: #ffffff;
      color: var(--text);
      border-radius: 6px;
      cursor: pointer;
    }
    button:hover {
      border-color: #9caec4;
    }
    button.primary {
      background: var(--accent);
      border-color: var(--accent);
      color: #ffffff;
    }
    .shell {
      min-height: 100vh;
      display: grid;
      grid-template-rows: auto 1fr;
    }
    .topbar {
      display: grid;
      grid-template-columns: minmax(180px, 1fr) auto auto;
      gap: 10px;
      align-items: center;
      padding: 14px 18px;
      background: rgba(255, 255, 255, 0.92);
      border-bottom: 1px solid var(--line);
      position: sticky;
      top: 0;
      z-index: 5;
      backdrop-filter: blur(12px);
    }
    .email-input {
      min-width: 0;
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 10px 12px;
      background: #ffffff;
      color: var(--text);
    }
    .topbar button {
      min-height: 40px;
      padding: 0 14px;
      white-space: nowrap;
    }
    .layout {
      display: grid;
      grid-template-columns: minmax(280px, 380px) minmax(0, 1fr);
      min-height: 0;
    }
    .sidebar {
      border-right: 1px solid var(--line);
      background: #fbfcfe;
      min-height: 0;
      overflow: auto;
    }
    .status {
      min-height: 38px;
      padding: 11px 14px;
      color: var(--muted);
      border-bottom: 1px solid var(--line);
      font-size: 13px;
    }
    .status.error {
      color: var(--danger);
    }
    .list {
      display: grid;
      gap: 8px;
      padding: 10px;
    }
    .message-item {
      display: grid;
      gap: 5px;
      width: 100%;
      padding: 10px;
      text-align: left;
      border-radius: 8px;
      background: #ffffff;
      box-shadow: 0 1px 0 rgba(20, 30, 44, 0.04);
    }
    .message-item.active {
      border-color: var(--accent);
      background: var(--accent-weak);
    }
    .message-title {
      font-weight: 700;
      overflow-wrap: anywhere;
    }
    .message-meta,
    .message-preview {
      color: var(--muted);
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    .content {
      min-width: 0;
      min-height: 0;
      overflow: auto;
      background: var(--panel);
    }
    .empty {
      min-height: 100%;
      display: grid;
      place-items: center;
      color: var(--muted);
      padding: 30px;
      text-align: center;
    }
    .message-view {
      display: none;
      min-height: 100%;
    }
    .message-head {
      padding: 18px 22px;
      border-bottom: 1px solid var(--line);
      display: grid;
      gap: 8px;
    }
    .subject {
      margin: 0;
      font-size: 22px;
      line-height: 1.2;
      overflow-wrap: anywhere;
    }
    .meta-grid {
      display: grid;
      gap: 4px;
      color: var(--muted);
      font-size: 13px;
      overflow-wrap: anywhere;
    }
    .code {
      display: none;
      width: fit-content;
      border: 1px solid #b7e1d8;
      background: #eefbf8;
      color: #075e54;
      border-radius: 6px;
      padding: 4px 8px;
      font-weight: 700;
      letter-spacing: 0;
    }
    .tabs {
      display: flex;
      gap: 8px;
      padding: 12px 22px;
      border-bottom: 1px solid var(--line);
      background: #fbfcfe;
      position: sticky;
      top: 69px;
      z-index: 2;
    }
    .tabs button {
      min-height: 34px;
      padding: 0 12px;
    }
    .tabs button.active {
      background: var(--text);
      border-color: var(--text);
      color: #ffffff;
    }
    .body-wrap {
      padding: 18px 22px 40px;
    }
    pre {
      margin: 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    }
    iframe {
      width: 100%;
      min-height: 70vh;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #ffffff;
    }

    @media (max-width: 760px) {
      .topbar {
        grid-template-columns: 1fr;
      }
      .layout {
        grid-template-columns: 1fr;
      }
      .sidebar {
        max-height: 42vh;
        border-right: 0;
        border-bottom: 1px solid var(--line);
      }
      .tabs {
        top: 158px;
      }
      .subject {
        font-size: 18px;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <form class="topbar" id="filterForm">
      <input class="email-input" id="emailInput" name="email" type="email" autocomplete="off" placeholder="name@example.com">
      <button class="primary" type="submit">Load</button>
      <button id="refreshButton" type="button">Refresh</button>
    </form>
    <div class="layout">
      <aside class="sidebar">
        <div class="status" id="status">Loading messages...</div>
        <div class="list" id="messageList"></div>
      </aside>
      <main class="content">
        <div class="empty" id="emptyState">Select a message from the list.</div>
        <article class="message-view" id="messageView">
          <header class="message-head">
            <h1 class="subject" id="subject"></h1>
            <div class="meta-grid">
              <div id="fromLine"></div>
              <div id="toLine"></div>
              <div id="timeLine"></div>
            </div>
            <div class="code" id="codeBadge"></div>
          </header>
          <nav class="tabs" aria-label="Message body views">
            <button type="button" class="active" data-tab="text">Text</button>
            <button type="button" data-tab="html">HTML</button>
            <button type="button" data-tab="raw">Raw</button>
          </nav>
          <section class="body-wrap" id="bodyWrap"></section>
        </article>
      </main>
    </div>
  </div>
  <script>
    var state = {
      email: "",
      token: "",
      messages: [],
      selectedId: null,
      selectedMessage: null,
      tab: "text"
    };

    var params = new URLSearchParams(location.search);
    state.email = params.get("email") || "";
    state.token = params.get("token") || "";
    state.selectedId = params.get("id");

    var emailInput = document.getElementById("emailInput");
    var statusEl = document.getElementById("status");
    var listEl = document.getElementById("messageList");
    var emptyState = document.getElementById("emptyState");
    var messageView = document.getElementById("messageView");
    var bodyWrap = document.getElementById("bodyWrap");
    var codeBadge = document.getElementById("codeBadge");

    emailInput.value = state.email;

    document.getElementById("filterForm").addEventListener("submit", function (event) {
      event.preventDefault();
      state.email = emailInput.value.trim();
      state.selectedId = null;
      updateUrl();
      loadMessages();
    });

    document.getElementById("refreshButton").addEventListener("click", function () {
      loadMessages(state.selectedId);
    });

    document.querySelectorAll(".tabs button").forEach(function (button) {
      button.addEventListener("click", function () {
        state.tab = button.getAttribute("data-tab");
        renderTabs();
        renderBody();
      });
    });

    function apiUrl(path, extraParams) {
      var url = new URL(path, location.href);
      if (state.token) {
        url.searchParams.set("token", state.token);
      }
      Object.keys(extraParams || {}).forEach(function (key) {
        if (extraParams[key] !== undefined && extraParams[key] !== null && extraParams[key] !== "") {
          url.searchParams.set(key, extraParams[key]);
        }
      });
      return url.toString();
    }

    async function loadMessages(preferredId) {
      setStatus("Loading messages...");
      listEl.innerHTML = "";
      try {
        var response = await fetch(apiUrl("/api/messages", { email: state.email, limit: 80 }));
        var data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "request_failed");
        }
        state.messages = data.messages || [];
        renderList();
        var idToOpen = preferredId || state.selectedId || (state.messages[0] && state.messages[0].id);
        if (idToOpen) {
          await openMessage(idToOpen);
        } else {
          showEmpty("No messages found.");
        }
        setStatus(state.messages.length + " message(s)");
      } catch (error) {
        setStatus(String(error.message || error), true);
        showEmpty("Unable to load messages.");
      }
    }

    function renderList() {
      listEl.innerHTML = "";
      state.messages.forEach(function (message) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = "message-item" + (String(message.id) === String(state.selectedId) ? " active" : "");
        button.addEventListener("click", function () {
          openMessage(message.id);
        });

        var title = document.createElement("div");
        title.className = "message-title";
        title.textContent = message.subject || "(no subject)";

        var meta = document.createElement("div");
        meta.className = "message-meta";
        meta.textContent = (message.sender || "unknown sender") + " - " + formatTime(message.received_at);

        var preview = document.createElement("div");
        preview.className = "message-preview";
        preview.textContent = compact(message.preview || "");

        button.appendChild(title);
        button.appendChild(meta);
        button.appendChild(preview);
        listEl.appendChild(button);
      });
    }

    async function openMessage(id) {
      state.selectedId = String(id);
      updateUrl();
      renderList();
      setStatus("Loading message...");
      try {
        var response = await fetch(apiUrl("/api/messages/" + encodeURIComponent(id)));
        var data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "request_failed");
        }
        state.selectedMessage = data.message;
        renderMessage();
        setStatus(state.messages.length + " message(s)");
      } catch (error) {
        setStatus(String(error.message || error), true);
      }
    }

    function renderMessage() {
      var message = state.selectedMessage;
      if (!message) {
        showEmpty("Select a message from the list.");
        return;
      }

      emptyState.style.display = "none";
      messageView.style.display = "block";
      document.getElementById("subject").textContent = message.subject || "(no subject)";
      document.getElementById("fromLine").textContent = "From: " + (message.sender || "");
      document.getElementById("toLine").textContent = "To: " + (message.recipient || "");
      document.getElementById("timeLine").textContent = "Received: " + formatTime(message.received_at);

      if (message.verification_code) {
        codeBadge.style.display = "block";
        codeBadge.textContent = "Code: " + message.verification_code;
      } else {
        codeBadge.style.display = "none";
        codeBadge.textContent = "";
      }

      renderTabs();
      renderBody();
    }

    function renderTabs() {
      document.querySelectorAll(".tabs button").forEach(function (button) {
        button.classList.toggle("active", button.getAttribute("data-tab") === state.tab);
      });
    }

    function renderBody() {
      bodyWrap.innerHTML = "";
      var message = state.selectedMessage || {};
      if (state.tab === "html") {
        var iframe = document.createElement("iframe");
        iframe.setAttribute("sandbox", "");
        iframe.srcdoc = message.html_body || "<pre>No HTML body.</pre>";
        bodyWrap.appendChild(iframe);
        return;
      }

      var pre = document.createElement("pre");
      if (state.tab === "raw") {
        pre.textContent = message.raw_email || "";
      } else {
        pre.textContent = message.text_body || "No text body.";
      }
      bodyWrap.appendChild(pre);
    }

    function showEmpty(text) {
      state.selectedMessage = null;
      emptyState.textContent = text;
      emptyState.style.display = "grid";
      messageView.style.display = "none";
    }

    function setStatus(text, isError) {
      statusEl.textContent = text;
      statusEl.classList.toggle("error", Boolean(isError));
    }

    function updateUrl() {
      var next = new URL(location.href);
      next.search = "";
      if (state.email) {
        next.searchParams.set("email", state.email);
      }
      if (state.selectedId) {
        next.searchParams.set("id", state.selectedId);
      }
      if (state.token) {
        next.searchParams.set("token", state.token);
      }
      history.replaceState(null, "", next.toString());
    }

    function compact(value) {
      return String(value || "").replace(/\\s+/g, " ").trim();
    }

    function formatTime(value) {
      if (!value) {
        return "";
      }
      try {
        return new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "medium"
        }).format(new Date(Number(value)));
      } catch (error) {
        return String(value);
      }
    }

    loadMessages();
  </script>
</body>
</html>`;
}

function isAuthorized(request, env, url) {
  if (!env.ACCESS_TOKEN) {
    return true;
  }

  const auth = request.headers.get("authorization") || "";
  return auth === "Bearer " + env.ACCESS_TOKEN || url.searchParams.get("token") === env.ACCESS_TOKEN;
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: JSON_HEADERS
  });
}

async function streamToString(stream) {
  if (typeof stream === "string") {
    return stream;
  }

  if (stream instanceof ArrayBuffer) {
    return new TextDecoder("utf-8", { fatal: false }).decode(stream);
  }

  const reader = stream.getReader();
  const chunks = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function parseMimeMessage(rawEmail) {
  const entity = parseMimeEntity(rawEmail);
  return {
    headers: entity.headers,
    text: entity.textParts.join("\n\n").trim(),
    html: entity.htmlParts.join("\n\n").trim()
  };
}

function parseMimeEntity(raw) {
  const split = splitHeaderBody(raw);
  const headers = parseHeaderBlock(split.headerText);
  const contentType = parseContentType(headers["content-type"] || "text/plain; charset=utf-8");
  const transferEncoding = (headers["content-transfer-encoding"] || "7bit").toLowerCase();
  const textParts = [];
  const htmlParts = [];

  if (contentType.type.startsWith("multipart/") && contentType.params.boundary) {
    for (const part of splitMultipartBody(split.bodyText, contentType.params.boundary)) {
      const parsedPart = parseMimeEntity(part);
      textParts.push(...parsedPart.textParts);
      htmlParts.push(...parsedPart.htmlParts);
    }
  } else if (contentType.type === "text/plain") {
    textParts.push(decodePartBody(split.bodyText, transferEncoding, contentType.params.charset));
  } else if (contentType.type === "text/html") {
    htmlParts.push(decodePartBody(split.bodyText, transferEncoding, contentType.params.charset));
  }

  return { headers, textParts, htmlParts };
}

function splitHeaderBody(raw) {
  const crlfIndex = raw.indexOf("\r\n\r\n");
  if (crlfIndex !== -1) {
    return {
      headerText: raw.slice(0, crlfIndex),
      bodyText: raw.slice(crlfIndex + 4)
    };
  }

  const lfIndex = raw.indexOf("\n\n");
  if (lfIndex !== -1) {
    return {
      headerText: raw.slice(0, lfIndex),
      bodyText: raw.slice(lfIndex + 2)
    };
  }

  return { headerText: raw, bodyText: "" };
}

function parseHeaderBlock(headerText) {
  const headers = {};
  const lines = headerText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const unfolded = [];

  for (const line of lines) {
    if (/^[ \t]/.test(line) && unfolded.length) {
      unfolded[unfolded.length - 1] += " " + line.trim();
    } else if (line.trim()) {
      unfolded.push(line);
    }
  }

  for (const line of unfolded) {
    const index = line.indexOf(":");
    if (index === -1) {
      continue;
    }

    const key = line.slice(0, index).trim().toLowerCase();
    const value = decodeMimeWords(line.slice(index + 1).trim());
    headers[key] = headers[key] ? headers[key] + ", " + value : value;
  }

  return headers;
}

function parseContentType(value) {
  const segments = value.split(";");
  const type = (segments.shift() || "text/plain").trim().toLowerCase();
  const params = {};

  for (const segment of segments) {
    const index = segment.indexOf("=");
    if (index === -1) {
      continue;
    }
    const key = segment.slice(0, index).trim().toLowerCase();
    let paramValue = segment.slice(index + 1).trim();
    if (paramValue.startsWith('"') && paramValue.endsWith('"')) {
      paramValue = paramValue.slice(1, -1);
    }
    params[key] = paramValue;
  }

  return { type, params };
}

function splitMultipartBody(body, boundary) {
  const start = "--" + boundary;
  const end = start + "--";
  const lines = body.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const parts = [];
  let current = [];
  let inside = false;

  for (const line of lines) {
    if (line === start || line === end) {
      if (inside && current.length) {
        parts.push(current.join("\r\n"));
      }
      current = [];
      inside = line !== end;
      if (line === end) {
        break;
      }
      continue;
    }

    if (inside) {
      current.push(line);
    }
  }

  return parts;
}

function decodePartBody(body, transferEncoding, charset) {
  const encoding = (transferEncoding || "").toLowerCase();

  if (encoding === "base64") {
    return decodeBytes(base64ToBytes(body), charset);
  }

  if (encoding === "quoted-printable") {
    return decodeBytes(quotedPrintableToBytes(body), charset);
  }

  return body.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function decodeMimeWords(value) {
  return String(value || "").replace(/=\?([^?]+)\?([bqBQ])\?([^?]*)\?=/g, function (_match, charset, encoding, encoded) {
    try {
      if (encoding.toLowerCase() === "b") {
        return decodeBytes(base64ToBytes(encoded), charset);
      }
      return decodeBytes(quotedPrintableToBytes(encoded.replace(/_/g, " ")), charset);
    } catch (_error) {
      return encoded;
    }
  });
}

function base64ToBytes(value) {
  const cleaned = String(value || "").replace(/\s+/g, "");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function quotedPrintableToBytes(value) {
  const input = String(value || "").replace(/=\r?\n/g, "");
  const bytes = [];

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === "=" && /^[0-9a-fA-F]{2}$/.test(input.slice(index + 1, index + 3))) {
      bytes.push(parseInt(input.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(input.charCodeAt(index) & 0xff);
    }
  }

  return new Uint8Array(bytes);
}

function decodeBytes(bytes, charset) {
  const label = normalizeCharset(charset);
  try {
    return new TextDecoder(label, { fatal: false }).decode(bytes).trim();
  } catch (_error) {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes).trim();
  }
}

function normalizeCharset(charset) {
  const label = String(charset || "utf-8").trim().toLowerCase().replace(/^"|"$/g, "");
  if (!label || label === "utf8") {
    return "utf-8";
  }
  return label;
}

function normalizeEmail(value) {
  const text = decodeMimeWords(String(value || "")).trim();
  const angleMatch = text.match(/<([^<>@\s]+@[^<>\s]+)>/);
  const plainMatch = text.match(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i);
  return (angleMatch ? angleMatch[1] : plainMatch ? plainMatch[1] : text).trim().toLowerCase();
}

function extractVerificationCode(input) {
  const text = compactText(input).slice(0, 20000);
  if (!text) {
    return null;
  }

  const codeWord =
    "(?:\\u9a8c\\u8bc1\\u7801|\\u6821\\u9a8c\\u7801|\\u52a8\\u6001\\u7801|\\u5b89\\u5168\\u7801|verification\\s*code|security\\s*code|login\\s*code|one[-\\s]*time\\s*code|otp|passcode|code)";
  const before = new RegExp(codeWord + "(?:\\s*(?:is|are|:|=|#|-|\\u662f|\\u4e3a|\\u70ba|\\uff1a))*\\s*([A-Z0-9]{4,10})\\b", "i");
  const after = new RegExp("\\b([A-Z0-9]{4,10})\\b(?:\\s*(?:is|are|:|=|#|-|\\u662f|\\u4e3a|\\u70ba|\\uff1a))*\\s*" + codeWord, "i");

  for (const regex of [before, after]) {
    const match = text.match(regex);
    if (match && looksLikeCode(match[1])) {
      return match[1].toUpperCase();
    }
  }

  const numeric = text.match(/\b(?!19\d{2}\b|20\d{2}\b)\d{4,8}\b/);
  return numeric ? numeric[0] : null;
}

function looksLikeCode(value) {
  const code = String(value || "");
  if (!/^[A-Z0-9]{4,10}$/i.test(code)) {
    return false;
  }
  if (/^[A-Z]+$/i.test(code) && code.length > 6) {
    return false;
  }
  return true;
}

function htmlToText(html) {
  return decodeHtmlEntities(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  );
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, function (_match, code) {
      return String.fromCharCode(Number(code));
    })
    .replace(/&#x([0-9a-f]+);/gi, function (_match, code) {
      return String.fromCharCode(parseInt(code, 16));
    });
}

function compactText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function truncateUtf8(value, maxBytes) {
  const text = String(value || "");
  if (byteLength(text) <= maxBytes) {
    return text;
  }

  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (byteLength(text.slice(0, mid)) <= maxBytes) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return text.slice(0, low);
}

function byteLength(value) {
  return new TextEncoder().encode(String(value || "")).byteLength;
}

function clampInt(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}
