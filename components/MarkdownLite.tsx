import type { ReactNode } from "react";

// Minimal hand-rolled renderer for the basic constructs Raekwon is instructed
// to use (# / ## headers, - bullets, **bold**, [text](url) links) — avoids
// adding a markdown npm dependency for content this app's own prompt already
// constrains to a small, known subset.

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Matches **bold** or [text](url); everything else is plain text.
  const pattern = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    if (match[1] !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-${i++}`}>{match[1]}</strong>);
    } else {
      nodes.push(
        <a key={`${keyPrefix}-${i++}`} href={match[3]} target="_blank" rel="noopener noreferrer" className="text-primary-dark underline">
          {match[2]}
        </a>
      );
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

export function MarkdownLite({ markdown }: { markdown: string }) {
  const lines = markdown.split("\n");
  const elements: ReactNode[] = [];
  let listBuffer: string[] = [];

  function flushList(key: string) {
    if (listBuffer.length === 0) return;
    elements.push(
      <ul key={key} className="ml-5 list-disc space-y-1">
        {listBuffer.map((item, i) => (
          <li key={i}>{renderInline(item, `${key}-li-${i}`)}</li>
        ))}
      </ul>
    );
    listBuffer = [];
  }

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const bulletMatch = trimmed.match(/^-\s+(.*)$/);
    if (bulletMatch) {
      listBuffer.push(bulletMatch[1]);
      return;
    }
    flushList(`list-${index}`);

    if (!trimmed) return;
    const h2Match = trimmed.match(/^##\s+(.*)$/);
    const h1Match = trimmed.match(/^#\s+(.*)$/);
    if (h2Match) {
      elements.push(
        <h3 key={index} className="mt-3 text-sm font-bold text-primary-dark">
          {renderInline(h2Match[1], `h2-${index}`)}
        </h3>
      );
    } else if (h1Match) {
      elements.push(
        <h2 key={index} className="mt-4 text-base font-extrabold text-foreground">
          {renderInline(h1Match[1], `h1-${index}`)}
        </h2>
      );
    } else {
      elements.push(
        <p key={index} className="text-sm text-foreground-muted">
          {renderInline(trimmed, `p-${index}`)}
        </p>
      );
    }
  });
  flushList("list-end");

  return <div className="space-y-2">{elements}</div>;
}
