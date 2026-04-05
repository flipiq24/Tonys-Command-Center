import { getGmail } from "./google-auth";

export async function listRecentEmails(maxResults = 10): Promise<{
  id: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
}[]> {
  try {
    const gmail = await getGmail();
    const list = await gmail.users.messages.list({
      userId: "me",
      maxResults,
      q: "is:unread",
    });

    const messages = list.data.messages || [];
    const results = [];

    for (const msg of messages.slice(0, maxResults)) {
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: msg.id!,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"],
      });

      const headers = detail.data.payload?.headers || [];
      const getHeader = (name: string) => headers.find(h => h.name === name)?.value || "";

      results.push({
        id: msg.id!,
        from: getHeader("From"),
        subject: getHeader("Subject"),
        snippet: detail.data.snippet || "",
        date: getHeader("Date"),
      });
    }

    return results;
  } catch (err) {
    console.warn("[Gmail] listRecentEmails failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

export async function draftReply(params: {
  to: string;
  subject: string;
  body: string;
  threadId?: string;
}): Promise<{ ok: boolean; draftId?: string; error?: string }> {
  try {
    const gmail = await getGmail();
    const raw = Buffer.from(
      [
        `To: ${params.to}`,
        `Subject: ${params.subject}`,
        `Content-Type: text/plain; charset=UTF-8`,
        "",
        params.body,
      ].join("\r\n")
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const draft = await gmail.users.drafts.create({
      userId: "me",
      requestBody: {
        message: {
          raw,
          ...(params.threadId ? { threadId: params.threadId } : {}),
        },
      },
    });

    return { ok: true, draftId: draft.data.id || undefined };
  } catch (err) {
    console.warn("[Gmail] draftReply failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: String(err) };
  }
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  body: string;
  threadId?: string;
  cc?: string;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  try {
    const gmail = await getGmail();
    const headerLines = [
      `To: ${params.to}`,
      `Subject: ${params.subject}`,
      `Content-Type: text/plain; charset=UTF-8`,
    ];
    if (params.cc) headerLines.push(`Cc: ${params.cc}`);
    headerLines.push("", params.body);

    const raw = Buffer.from(headerLines.join("\r\n"))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const sent = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw,
        ...(params.threadId ? { threadId: params.threadId } : {}),
      },
    });

    return { ok: true, messageId: sent.data.id || undefined };
  } catch (err) {
    console.warn("[Gmail] sendEmail failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: String(err) };
  }
}

export async function searchEmails(query: string, maxResults = 20): Promise<{
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  date: string;
  unread: boolean;
}[]> {
  try {
    const gmail = await getGmail();
    const list = await gmail.users.messages.list({ userId: "me", q: query, maxResults });
    const messages = list.data.messages || [];
    const results = [];

    for (const msg of messages.slice(0, maxResults)) {
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: msg.id!,
        format: "metadata",
        metadataHeaders: ["From", "To", "Subject", "Date"],
      });

      const headers = detail.data.payload?.headers || [];
      const getHeader = (name: string) => headers.find(h => h.name === name)?.value || "";
      const labelIds = detail.data.labelIds || [];

      results.push({
        id: msg.id!,
        threadId: detail.data.threadId || "",
        from: getHeader("From"),
        to: getHeader("To"),
        subject: getHeader("Subject"),
        snippet: detail.data.snippet || "",
        date: getHeader("Date"),
        unread: labelIds.includes("UNREAD"),
      });
    }

    return results;
  } catch (err) {
    console.warn("[Gmail] searchEmails failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

export async function getEmailThread(threadId: string): Promise<{
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  date: string;
}[]> {
  try {
    const gmail = await getGmail();
    const thread = await gmail.users.threads.get({ userId: "me", id: threadId, format: "full" });
    const messages = thread.data.messages || [];

    return messages.map(msg => {
      const headers = msg.payload?.headers || [];
      const getHeader = (name: string) => headers.find(h => h.name === name)?.value || "";

      const findBody = (part: typeof msg.payload): string => {
        if (!part) return "";
        if (part.mimeType === "text/plain" && part.body?.data) {
          return Buffer.from(part.body.data, "base64").toString("utf-8");
        }
        if (part.parts) {
          for (const p of part.parts) {
            const text = findBody(p);
            if (text) return text;
          }
        }
        return "";
      };

      return {
        id: msg.id || "",
        from: getHeader("From"),
        to: getHeader("To"),
        subject: getHeader("Subject"),
        body: findBody(msg.payload),
        date: getHeader("Date"),
      };
    });
  } catch (err) {
    console.warn("[Gmail] getEmailThread failed:", err instanceof Error ? err.message : err);
    return [];
  }
}
