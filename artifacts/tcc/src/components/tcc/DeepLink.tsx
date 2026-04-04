import { C } from "./constants";

type LinkType = "email" | "calendar" | "slack" | "linear";

interface Props {
  type: LinkType;
  id: string;
  channelId?: string;
  messageTs?: string;
  identifier?: string;
}

function buildUrl(props: Props): string | null {
  switch (props.type) {
    case "email":
      return props.id ? `https://mail.google.com/mail/u/0/#inbox/${props.id}` : null;
    case "calendar": {
      if (!props.id) return null;
      const encoded = btoa(props.id).replace(/=+$/, "");
      return `https://www.google.com/calendar/event?eid=${encoded}`;
    }
    case "slack":
      if (!props.channelId || !props.messageTs) return null;
      return `https://flipiq.slack.com/archives/${props.channelId}/p${props.messageTs.replace(".", "")}`;
    case "linear":
      return props.identifier ? `https://linear.app/flipiq/issue/${props.identifier}` : null;
    default:
      return null;
  }
}

const icons: Record<LinkType, string> = {
  email: "✉",
  calendar: "📅",
  slack: "💬",
  linear: "◆",
};

const labels: Record<LinkType, string> = {
  email: "Gmail",
  calendar: "Google Calendar",
  slack: "Slack",
  linear: "Linear",
};

export function DeepLink(props: Props) {
  const url = buildUrl(props);
  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={`Open in ${labels[props.type]}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        color: C.mut,
        fontSize: 11,
        textDecoration: "none",
        border: `1px solid ${C.brd}`,
        borderRadius: 4,
        padding: "2px 6px",
        background: C.card,
        flexShrink: 0,
        transition: "color 0.15s",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = C.blu; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = C.mut; }}
    >
      <span>{icons[props.type]}</span>
      <span>Open</span>
    </a>
  );
}
