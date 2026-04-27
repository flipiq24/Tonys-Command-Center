import type { ReactNode } from "react";
import { createElement, Fragment } from "react";
import { C } from "../constants";

// Detect a contiguous markdown table block. Returns the rows (header + body)
// and the line indices it consumed; null if `lines[start]` doesn't begin a table.
function parseTableAt(lines: string[], start: number): { rows: string[][]; consumed: number } | null {
  if (start + 1 >= lines.length) return null;
  const header = lines[start];
  const sep = lines[start + 1];
  if (!/\|/.test(header) || !/^\s*\|?\s*:?[-]+:?\s*(\|\s*:?[-]+:?\s*)+\|?\s*$/.test(sep)) return null;

  const splitRow = (row: string): string[] => row.replace(/^\s*\|?|\|?\s*$/g, "").split("|").map(c => c.trim());

  const rows: string[][] = [splitRow(header)];
  let i = start + 2;
  for (; i < lines.length; i++) {
    const ln = lines[i];
    if (!/\|/.test(ln) || !ln.trim()) break;
    rows.push(splitRow(ln));
  }
  return { rows, consumed: i - start };
}

function renderTable(rows: string[][], key: number): ReactNode {
  const [head, ...body] = rows;
  return createElement(
    "table",
    {
      key,
      style: {
        borderCollapse: "collapse" as const,
        margin: "8px 0",
        fontSize: 13,
        width: "100%",
        background: C.card,
        border: `1px solid ${C.brd}`,
        borderRadius: 8,
        overflow: "hidden" as const,
      },
    },
    createElement(
      "thead",
      { key: "h" },
      createElement(
        "tr",
        { key: "hr", style: { background: "#F9FAFB" } },
        ...head.map((c, ci) =>
          createElement(
            "th",
            {
              key: ci,
              style: {
                padding: "8px 10px",
                textAlign: "left" as const,
                fontWeight: 600,
                color: C.tx,
                borderBottom: `1px solid ${C.brd}`,
              },
            },
            c
          )
        )
      )
    ),
    createElement(
      "tbody",
      { key: "b" },
      ...body.map((r, ri) =>
        createElement(
          "tr",
          { key: ri },
          ...r.map((c, ci) =>
            createElement(
              "td",
              {
                key: ci,
                style: {
                  padding: "8px 10px",
                  borderBottom: ri === body.length - 1 ? "none" : `1px solid ${C.brd}`,
                  color: C.sub,
                  verticalAlign: "top" as const,
                },
              },
              renderInline(c, `${ri}-${ci}`)
            )
          )
        )
      )
    )
  );
}

// Render inline markdown (bold, italic, code, links) inside a single string.
function renderInline(text: string, keyPrefix: string | number): ReactNode {
  // Strip basic markdown syntax (bold/italic/code) — we already do this for
  // body text below; reuse a minimal pass here so table cells stay clean.
  const stripped = text
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/`(.+?)`/g, "$1");

  // Linkify
  const parts: ReactNode[] = [];
  const re = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)|(https?:\/\/\S+)/g;
  let last = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(stripped)) !== null) {
    if (m.index > last) parts.push(stripped.slice(last, m.index));
    if (m[1] && m[2]) {
      parts.push(createElement("a", { key: `${keyPrefix}-${k++}`, href: m[2], target: "_blank", rel: "noopener noreferrer", style: { color: C.blu, textDecoration: "underline" } }, m[1]));
    } else if (m[3]) {
      const url = m[3].replace(/[.,;:!?'")\]]+$/, "");
      const trail = m[3].slice(url.length);
      parts.push(createElement("a", { key: `${keyPrefix}-${k++}`, href: url, target: "_blank", rel: "noopener noreferrer", style: { color: C.blu, textDecoration: "underline", wordBreak: "break-all" as const } }, url));
      if (trail) parts.push(trail);
    }
    last = m.index + m[0].length;
  }
  if (last < stripped.length) parts.push(stripped.slice(last));
  return parts.length === 1 ? parts[0] : createElement(Fragment, null, ...parts);
}

export function renderMarkdown(text: string): ReactNode {
  // First strip code fences and normalise whitespace
  const cleaned = text
    .replace(/```[\s\S]*?```/g, m => m.replace(/```[^\n]*\n?/g, "").trim())
    .replace(/\n{3,}/g, "\n\n");

  const lines = cleaned.split("\n");
  const blocks: ReactNode[] = [];
  let buffer: string[] = [];
  let blockKey = 0;

  const flushBuffer = () => {
    if (buffer.length === 0) return;
    const joined = buffer.join("\n");
    const stripped = joined
      .replace(/#{1,6}\s+(.+)/g, "$1")
      .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/__(.+?)__/g, "$1")
      .replace(/_(.+?)_/g, "$1")
      .replace(/`(.+?)`/g, "$1")
      .replace(/^\s*[-*+]\s+/gm, "\u2022 ")
      .replace(/^\s*\d+\.\s+/gm, "")
      .replace(/^[-_*]{3,}$/gm, "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
    blocks.push(createElement("span", { key: `t${blockKey++}` }, renderInline(stripped, `b${blockKey}`)));
    buffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const tbl = parseTableAt(lines, i);
    if (tbl) {
      flushBuffer();
      blocks.push(renderTable(tbl.rows, blockKey++));
      i += tbl.consumed - 1;
    } else {
      buffer.push(lines[i]);
    }
  }
  flushBuffer();

  return createElement("span", null, ...blocks);
}
