/**
 * Convert a markdown string to sanitized HTML for display.
 * Input is always AI-generated from our own Groq calls — not user-supplied HTML.
 * All angle brackets in code blocks are HTML-escaped before insertion.
 */
export function markdownToRichText(markdown: string): string {
  let html = markdown;

  const escapeHtml = (text: string) =>
    text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  html = html.replace(/```([\s\S]*?)```/g, (_match, code) =>
    `<pre class="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg overflow-x-auto my-2"><code class="text-xs font-mono">${escapeHtml(code.trim())}</code></pre>`
  );
  html = html.replace(/`([^`]+)`/g, '<code class="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-xs font-mono">$1</code>');
  html = html.replace(/^### (.*$)/gm, '<h3 class="text-base font-semibold mt-4 mb-2 text-gray-900 dark:text-gray-100">$1</h3>');
  html = html.replace(/^## (.*$)/gm, '<h2 class="text-lg font-semibold mt-4 mb-2 text-gray-900 dark:text-gray-100">$1</h2>');
  html = html.replace(/^# (.*$)/gm, '<h1 class="text-xl font-bold mt-4 mb-2 text-gray-900 dark:text-gray-100">$1</h1>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong class="font-semibold">$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em class="italic">$1</em>');
  html = html.replace(/_(.*?)_/g, '<em class="italic">$1</em>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-orange-600 dark:text-orange-400 hover:underline">$1</a>');
  html = html.replace(/^[*+-]\s+(.+)$/gm, '<li class="ml-4 list-disc">$1</li>');
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<li class="ml-4 list-decimal">$1</li>');
  html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, (match) => {
    if (match.includes('list-decimal')) return `<ol class="space-y-1 my-2">${match}</ol>`;
    return `<ul class="space-y-1 my-2">${match}</ul>`;
  });
  html = html.replace(/^---$/gm, '<hr class="my-4 border-gray-300 dark:border-gray-700" />');
  html = html.split('\n\n').map(paragraph => {
    if (paragraph.trim()) {
      if (/^<(h[1-6]|ul|ol|pre|hr)/.test(paragraph.trim())) return paragraph.trim();
      const withBreaks = paragraph.replace(/\n/g, '<br />');
      return `<p class="leading-relaxed mb-2">${withBreaks}</p>`;
    }
    return '';
  }).join('');

  return html;
}
