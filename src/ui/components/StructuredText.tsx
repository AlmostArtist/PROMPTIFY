import type { ReactNode } from 'react';

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) => {
    const strong = /^\*\*(.+)\*\*$/.exec(part);
    return strong ? <strong key={index}>{strong[1]}</strong> : <span key={index}>{part}</span>;
  });
}

/**
 * Compact, readable rendering for AI answers. Every list item gets its own
 * visual marker and surface so dense model output never collapses into a wall
 * of text in the narrow panel or Quick Tools rail.
 */
export function StructuredText({ text, compact = false }: { text: string; compact?: boolean }) {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  return (
    <div className="pk-structured-text" data-compact={compact || undefined}>
      {lines.map((line, index) => {
        const bullet = line.match(/^[-*•]\s+(.+)/);
        const ordered = line.match(/^(\d+)[.)]\s+(.+)/);
        const markdownHeading = line.match(/^#{1,4}\s+(.+)/);
        const boldHeading = line.match(/^\*\*([^*]+)\*\*:?$/);
        const shortHeading = !bullet && !ordered && line.length < 54 && /:$/.test(line);

        if (bullet || ordered) {
          const content = bullet?.[1] ?? ordered?.[2] ?? line;
          return (
            <div className="pk-structured-point" key={index}>
              <span className="pk-structured-dot" data-numbered={ordered ? true : undefined}>{ordered?.[1]}</span>
              <span>{inline(content)}</span>
            </div>
          );
        }

        if (markdownHeading || boldHeading || shortHeading) {
          const content = markdownHeading?.[1] ?? boldHeading?.[1] ?? line.replace(/:$/, '');
          return <h4 key={index}>{inline(content)}</h4>;
        }

        return <p key={index}>{inline(line)}</p>;
      })}
    </div>
  );
}
