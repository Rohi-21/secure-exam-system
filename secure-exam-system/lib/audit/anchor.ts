/**
 * External audit chain anchor — GitHub Gist + email notification
 *
 * Every 10 minutes (or on key events), the current audit chain head hash
 * is published to a GitHub Gist and emailed to enrolled students.
 *
 * Purpose: Makes retroactive tampering of the audit chain detectable by
 * anyone who received the previously published chain head.
 *
 * Limitation: Only provides detection, not prevention. An attacker who
 * controls the server AND revokes GitHub access could suppress anchoring.
 * This is acknowledged and documented.
 */

import nodemailer from "nodemailer";

export interface AnchorPayload {
  examId: string;
  chainHead: string;        // Current latest entryHash (hex)
  sequenceNo: number;       // Current chain length
  anchoredAt: string;       // ISO 8601 timestamp
  systemVersion: string;
}

// ── GitHub Gist Anchoring ─────────────────────────────────────────────────────

/**
 * Publish or update the audit chain head to a GitHub Gist.
 * First call: creates a new Gist and returns its ID (store in GITHUB_GIST_ID env).
 * Subsequent calls: updates the same Gist.
 */
export async function anchorToGist(payload: AnchorPayload): Promise<string> {
  const token = process.env.GITHUB_GIST_TOKEN;
  const gistId = process.env.GITHUB_GIST_ID;

  if (!token) {
    console.warn("[anchor] GITHUB_GIST_TOKEN not set — skipping Gist anchor");
    return "no-token";
  }

  const content = JSON.stringify(payload, null, 2);
  const filename = `audit-chain-${payload.examId}.json`;
  const description = `CNS Secure Exam System — Audit Chain Head | Exam ${payload.examId} | Seq ${payload.sequenceNo}`;

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "CNS-SecureExam/1.0",
    Accept: "application/vnd.github+json",
  };

  if (gistId) {
    // Update existing Gist
    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        description,
        files: { [filename]: { content } },
      }),
    });
    const data = await res.json() as { html_url?: string };
    return data.html_url ?? gistId;
  } else {
    // Create new Gist
    const res = await fetch("https://api.github.com/gists", {
      method: "POST",
      headers,
      body: JSON.stringify({
        description,
        public: true,
        files: { [filename]: { content } },
      }),
    });
    const data = await res.json() as { id?: string; html_url?: string };
    if (data.id) {
      console.log(`[anchor] New Gist created: ${data.html_url}`);
      console.log(`[anchor] Set GITHUB_GIST_ID=${data.id} in .env.local`);
    }
    return data.html_url ?? "created";
  }
}

// ── Email Notification ────────────────────────────────────────────────────────

/**
 * Email the chain head to all enrolled students for a given exam.
 * Students can store this hash and later verify chain integrity independently.
 */
export async function emailChainHead(
  payload: AnchorPayload,
  recipientEmails: string[]
): Promise<void> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn("[anchor] SMTP not configured — skipping email anchor");
    return;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT ?? "587"),
    secure: false,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  const subject = `[Exam System] Audit Chain Update — Exam ${payload.examId}`;
  const text = `
Secure Exam System — Audit Chain Anchor Notification
=====================================================

Exam ID:      ${payload.examId}
Anchored At:  ${payload.anchoredAt}
Chain Head:   ${payload.chainHead}
Sequence No:  ${payload.sequenceNo}

Please store the Chain Head hash. You can use it later to verify that the
audit log has not been tampered with. Any change to any past event in the
audit log would produce a different chain head hash.

This is an automated notification from the KLE Secure Exam System.
`.trim();

  if (recipientEmails.length === 0) return;

  await transporter.sendMail({
    from: SMTP_FROM ?? SMTP_USER,
    bcc: recipientEmails,
    subject,
    text,
  });

  console.log(`[anchor] Chain head emailed to ${recipientEmails.length} recipient(s)`);
}

// ── Combined Anchor ───────────────────────────────────────────────────────────

/**
 * Publish chain head to both GitHub Gist and email.
 * Called periodically (every 10 min) or on key events (exam close, result release).
 */
export async function publishChainAnchor(
  payload: AnchorPayload,
  recipientEmails: string[] = []
): Promise<{ gistUrl: string; emailsSent: number }> {
  const [gistUrl] = await Promise.all([
    anchorToGist(payload),
    emailChainHead(payload, recipientEmails),
  ]);

  return { gistUrl, emailsSent: recipientEmails.length };
}
