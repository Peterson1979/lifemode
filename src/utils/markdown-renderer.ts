/**
 * Robust, high-fidelity Markdown to HTML renderer for development previews.
 * Converts markdown headings, paragraphs, lists, tables, blockquotes, code blocks, bold, italics, inline code, and links.
 * Preserves all valid UTF-8 characters natively without lossy conversion.
 */

export function cleanUtf8Characters(str: string): string {
  if (!str) return '';
  return str;
}

export function renderMarkdownToHtml(markdown: string): string {
  if (!markdown) return '';

  const cleanMarkdown = cleanUtf8Characters(markdown);
  const lines = cleanMarkdown.replace(/\r\n/g, '\n').split('\n');
  const htmlParts: string[] = [];
  
  let inList = false;
  let listType: 'ul' | 'ol' = 'ul';
  let inBlockquote = false;
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockLines: string[] = [];
  let blockquoteLines: string[] = [];
  let paragraphLines: string[] = [];
  let inTable = false;
  let tableHeaders: string[] = [];
  let tableRows: string[][] = [];

  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      const text = paragraphLines.join(' ').trim();
      if (text) {
        htmlParts.push(`<p>${formatInlineMarkdown(text)}</p>`);
      }
      paragraphLines = [];
    }
  };

  const flushList = () => {
    if (inList) {
      htmlParts.push(`</${listType}>`);
      inList = false;
    }
  };

  const flushBlockquote = () => {
    if (inBlockquote) {
      const quoteText = blockquoteLines.join(' ').trim();
      if (quoteText) {
        htmlParts.push(`<blockquote><p>${formatInlineMarkdown(quoteText)}</p></blockquote>`);
      }
      inBlockquote = false;
      blockquoteLines = [];
    }
  };

  const flushCodeBlock = () => {
    if (inCodeBlock) {
      const rawCode = codeBlockLines.join('\n');
      htmlParts.push(`<pre><code class="language-${escapeHtml(codeBlockLang || 'text')}">${escapeHtml(rawCode)}</code></pre>`);
      inCodeBlock = false;
      codeBlockLang = '';
      codeBlockLines = [];
    }
  };

  const flushTable = () => {
    if (inTable) {
      let tableHtml = '<div class="table-container"><table class="guide-table">';
      if (tableHeaders.length > 0) {
        tableHtml += '<thead><tr>';
        for (const th of tableHeaders) {
          tableHtml += `<th>${formatInlineMarkdown(th.trim())}</th>`;
        }
        tableHtml += '</tr></thead>';
      }
      if (tableRows.length > 0) {
        tableHtml += '<tbody>';
        for (const row of tableRows) {
          tableHtml += '<tr>';
          for (const cell of row) {
            tableHtml += `<td>${formatInlineMarkdown(cell.trim())}</td>`;
          }
          tableHtml += '</tr>';
        }
        tableHtml += '</tbody>';
      }
      tableHtml += '</table></div>';
      htmlParts.push(tableHtml);
      inTable = false;
      tableHeaders = [];
      tableRows = [];
    }
  };

  const flushAll = () => {
    flushParagraph();
    flushList();
    flushBlockquote();
    flushTable();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Code blocks (fences)
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        flushCodeBlock();
      } else {
        flushAll();
        inCodeBlock = true;
        codeBlockLang = trimmed.slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Empty lines
    if (!trimmed) {
      flushAll();
      continue;
    }

    // Markdown Table handling
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      flushParagraph();
      flushList();
      flushBlockquote();
      
      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());

      // Check if it's a separator line (|---|---|)
      const isSeparator = cells.every((c) => /^:?-+:?$/.test(c));
      if (isSeparator) {
        // Just the divider between header and body
        continue;
      }

      if (!inTable) {
        inTable = true;
        tableHeaders = cells;
      } else {
        tableRows.push(cells);
      }
      continue;
    } else if (inTable) {
      flushTable();
    }

    // Headings
    const h4Match = line.match(/^####\s+(.+)$/);
    if (h4Match) {
      flushAll();
      htmlParts.push(`<h4>${formatInlineMarkdown(h4Match[1])}</h4>`);
      continue;
    }

    const h3Match = line.match(/^###\s+(.+)$/);
    if (h3Match) {
      flushAll();
      htmlParts.push(`<h3>${formatInlineMarkdown(h3Match[1])}</h3>`);
      continue;
    }

    const h2Match = line.match(/^##\s+(.+)$/);
    if (h2Match) {
      flushAll();
      htmlParts.push(`<h2>${formatInlineMarkdown(h2Match[1])}</h2>`);
      continue;
    }

    const h1Match = line.match(/^#\s+(.+)$/);
    if (h1Match) {
      flushAll();
      htmlParts.push(`<h1>${formatInlineMarkdown(h1Match[1])}</h1>`);
      continue;
    }

    // Horizontal Rule
    if (/^(\*\*\*|---|___)$/.test(trimmed)) {
      flushAll();
      htmlParts.push('<hr />');
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      flushParagraph();
      flushList();
      flushTable();
      inBlockquote = true;
      blockquoteLines.push(trimmed.replace(/^>\s*/, ''));
      continue;
    } else if (inBlockquote) {
      flushBlockquote();
    }

    // Unordered List
    const ulMatch = line.match(/^[-*]\s+(.+)$/);
    if (ulMatch) {
      flushParagraph();
      flushBlockquote();
      flushTable();
      if (!inList || listType !== 'ul') {
        flushList();
        htmlParts.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      htmlParts.push(`<li>${formatInlineMarkdown(ulMatch[1])}</li>`);
      continue;
    }

    // Ordered List
    const olMatch = line.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      flushParagraph();
      flushBlockquote();
      flushTable();
      if (!inList || listType !== 'ol') {
        flushList();
        htmlParts.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      htmlParts.push(`<li>${formatInlineMarkdown(olMatch[1])}</li>`);
      continue;
    }

    // If in list but regular line
    if (inList) {
      flushList();
    }

    paragraphLines.push(line);
  }

  flushAll();
  flushCodeBlock();

  return htmlParts.join('\n');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatInlineMarkdown(text: string): string {
  if (!text) return '';

  let res = text;

  // Bold + Italic
  res = res.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  res = res.replace(/___([^_]+)___/g, '<strong><em>$1</em></strong>');

  // Bold
  res = res.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  res = res.replace(/__([^_]+)__/g, '<strong>$1</strong>');

  // Italic
  res = res.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  res = res.replace(/_([^_]+)_/g, '<em>$1</em>');

  // Inline code
  res = res.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Strikethrough
  res = res.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  // Links
  res = res.replace(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+|\/[^\s\)]+)\)/g, '<a href="$2" rel="noopener noreferrer" target="_blank">$1</a>');

  return res;
}
