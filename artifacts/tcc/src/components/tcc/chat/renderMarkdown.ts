import type { ReactNode } from "react";
import { createElement } from "react";
import { C } from "../constants";

export function renderMarkdown(text: string): ReactNode {
  const processed = text
    .replace(/```[\s\S]*?```/g, m => m.replace(/```[^\n]*\n?/g, "").trim())
    .replace(/#{1,6}\s+(.+)/g, "$1")
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "\u2022 ")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^[-_*]{3,}$/gm, "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const parts: ReactNode[] = [];
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)|(https?:\/\/\S+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let k = 0;

  while ((match = linkRegex.exec(processed)) !== null) {
    if (match.index > lastIndex) parts.push(processed.slice(lastIndex, match.index));
    if (match[1] && match[2]) {
      parts.push(
        createElement("a", {
          key: k++,
          href: match[2],
          target: "_blank",
          rel: "noopener noreferrer",
          style: { color: C.blu, textDecoration: "underline" },
        }, match[1])
      );
    } else if (match[3]) {
      const url = match[3].replace(/[.,;:!?'")\]]+$/, "");
      const trail = match[3].slice(url.length);
      parts.push(
        createElement("a", {
          key: k++,
          href: url,
          target: "_blank",
          rel: "noopener noreferrer",
          style: { color: C.blu, textDecoration: "underline", wordBreak: "break-all" as const },
        }, url)
      );
      if (trail) parts.push(trail);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < processed.length) parts.push(processed.slice(lastIndex));
  return createElement("span", null, ...parts);
}
