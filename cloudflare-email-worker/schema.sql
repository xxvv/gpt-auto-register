CREATE TABLE IF NOT EXISTS email_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT,
  sender TEXT,
  sender_lc TEXT,
  recipient TEXT NOT NULL,
  recipient_lc TEXT NOT NULL,
  subject TEXT,
  date_header TEXT,
  received_at INTEGER NOT NULL,
  raw_size INTEGER NOT NULL DEFAULT 0,
  raw_truncated INTEGER NOT NULL DEFAULT 0,
  text_body TEXT,
  html_body TEXT,
  raw_email TEXT,
  verification_code TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_messages_message_id
  ON email_messages(message_id);

CREATE INDEX IF NOT EXISTS idx_email_messages_recipient_received
  ON email_messages(recipient_lc, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_messages_received
  ON email_messages(received_at DESC);
