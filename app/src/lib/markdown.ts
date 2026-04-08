/**
 * Convert a markdown string to sanitized HTML for display.
 * Input is AI-generated prose, not arbitrary user HTML.
 */
export function markdownToRichText(markdown: string): string {
  const escapeHtml = (text: string) =>
    text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const applyInlineMarkdown = (text: string) => {
    let html = escapeHtml(text);
    html = html.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-orange-600 dark:text-orange-400 hover:underline">$1</a>',
    );
    html = html.replace(
      /`([^`]+)`/g,
      '<code class="rounded bg-orange-50/85 px-1.5 py-0.5 text-xs font-mono text-foreground dark:bg-white/10">$1</code>',
    );
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>');
    html = html.replace(/__(.*?)__/g, '<strong class="font-semibold">$1</strong>');
    html = html.replace(/(^|[\s(])\*(?!\*)([^*]+)\*(?!\*)/g, '$1<em class="italic">$2</em>');
    html = html.replace(/(^|[\s(])_(?!_)([^_]+)_(?!_)/g, '$1<em class="italic">$2</em>');
    return html;
  };

  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push(
        `<pre class="my-2 overflow-x-auto rounded-lg border border-orange-200/70 bg-orange-50/80 p-3 dark:border-orange-900/40 dark:bg-white/5"><code class="text-xs font-mono text-foreground">${escapeHtml(codeLines.join('\n').trim())}</code></pre>`,
      );
      continue;
    }

    const tableDivider = (value: string) => /^\|?\s*:?-{3,}:?(?:\s*\|\s*:?-{3,}:?)*\s*\|?$/.test(value.trim());
    if (
      trimmed.includes('|') &&
      i + 1 < lines.length &&
      tableDivider(lines[i + 1])
    ) {
      const parseCells = (row: string) =>
        row
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((cell) => cell.trim());

      const header = parseCells(lines[i]);
      const bodyRows: string[][] = [];
      i += 2;
      while (i < lines.length) {
        const row = lines[i].trim();
        if (!row || !row.includes('|')) break;
        bodyRows.push(parseCells(lines[i]));
        i += 1;
      }

      const thead = `<thead><tr>${header
        .map(
          (cell) =>
            `<th class="border border-orange-200/70 bg-orange-50/60 px-3 py-2 text-left text-xs font-semibold dark:border-orange-900/40 dark:bg-white/5">${applyInlineMarkdown(cell)}</th>`,
        )
        .join('')}</tr></thead>`;

      const tbody = bodyRows.length
        ? `<tbody>${bodyRows
            .map(
              (row) =>
                `<tr>${row
                  .map(
                    (cell) =>
                      `<td class="border border-orange-200/60 px-3 py-2 align-top text-sm dark:border-orange-900/30">${applyInlineMarkdown(cell)}</td>`,
                  )
                  .join('')}</tr>`,
            )
            .join('')}</tbody>`
        : '';

      blocks.push(
        `<div class="my-3 overflow-x-auto"><table class="w-full border-collapse text-sm">${thead}${tbody}</table></div>`,
      );
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = applyInlineMarkdown(headingMatch[2].trim());
      const cls =
        level === 1
          ? 'mt-4 mb-2 text-xl font-bold text-foreground'
          : level === 2
            ? 'mt-4 mb-2 text-lg font-semibold text-foreground'
            : 'mt-4 mb-2 text-base font-semibold text-foreground';
      blocks.push(`<h${level} class="${cls}">${text}</h${level}>`);
      i += 1;
      continue;
    }

    if (trimmed === '---') {
      blocks.push('<hr class="my-4 border-orange-200/70 dark:border-orange-900/40" />');
      i += 1;
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push(
        `<ol class="my-2 space-y-1">${items
          .map((item) => `<li class="ml-4 list-decimal">${applyInlineMarkdown(item)}</li>`)
          .join('')}</ol>`,
      );
      continue;
    }

    if (/^[*+-]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[*+-]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[*+-]\s+/, ''));
        i += 1;
      }
      blocks.push(
        `<ul class="my-2 space-y-1">${items
          .map((item) => `<li class="ml-4 list-disc">${applyInlineMarkdown(item)}</li>`)
          .join('')}</ul>`,
      );
      continue;
    }

    const paragraphLines: string[] = [];
    while (i < lines.length) {
      const current = lines[i];
      const currentTrimmed = current.trim();
      if (
        !currentTrimmed ||
        currentTrimmed.startsWith('```') ||
        /^(#{1,3})\s+/.test(currentTrimmed) ||
        currentTrimmed === '---' ||
        /^\d+\.\s+/.test(currentTrimmed) ||
        /^[*+-]\s+/.test(currentTrimmed) ||
        (currentTrimmed.includes('|') &&
          i + 1 < lines.length &&
          tableDivider(lines[i + 1]))
      ) {
        break;
      }
      paragraphLines.push(currentTrimmed);
      i += 1;
    }

    blocks.push(
      `<p class="leading-relaxed mb-2">${applyInlineMarkdown(paragraphLines.join('<br />'))}</p>`,
    );
  }

  return blocks.join('');
}
