/**
 * Normalizes and cleans up the raw text from the AI Analyst.
 * This ensures that streaming artifacts (like spaces in "it ' s") and
 * inconsistent newlines from different LLM engines are handled uniformly.
 */
export const formatAnalysisText = (text: string) => {
  if (!text) return '';

  const processed = text
    // Heal split bold fences emitted as ":* *" or "* *".
    .replace(/:\*\s+\*/g, ':**')
    .replace(/\*\s+\*/g, '**')
    // Force newline before every header (###) found anywhere.
    .replace(/([^\n])(###)/g, '$1\n$2')
    // Force newline after every header (### SECTION NAME).
    .replace(/(###\s+[A-Z\s,/-]+)(?=[A-Z1-9*])/g, '$1\n')
    // Force newline before every bullet point, but avoid markdown bold fences.
    .replace(/([^\n*])\s*([•*-])\s+/g, '$1\n$2 ')
    // Split sentences that end and a bullet starts immediately.
    .replace(/\.(\s*([•*-]))/g, '.\n$1')
    // Heal empty bullets where the AI put a newline after the dash.
    .replace(/([-•*])\s*\n\s*/g, '$1 ')
    // Heal split bold tags (e.g. "**High\nConfidence**").
    .replace(/\*\*([^*]+)\n+([^*]+)\*\*/g, '**$1 $2**')
    // Heal short trailing word fragments like "NARRATIV\nE".
    .replace(/([A-Za-z])\n([A-Za-z]{1,3})(?=\n|$)/g, '$1$2')
    // Legacy header support (bold headers).
    .replace(/([^\n])(\*\*.*?:?\*\*)/g, '$1\n$2');

  return processed
    .replace(/^(#+)([^\s#])/gm, '$1 $2')
    // Drop stray bullet marker lines that survive streaming cleanup.
    .replace(/^\s*[-*•]\s*$/gm, '')
    // Remove trailing dash artifacts from non-bullet scalar lines.
    .replace(/^(?!\s*[•*-]\s)(.+?)\s+-\s*$/gm, '$1')
    // If a stray bullet marker lands in front of a header, keep the header.
    .replace(/^\s*[-*•]\s+(###\s+)/gm, '$1')
    // Demote immediately nested markdown headers so they don't render as two top-level sections.
    .replace(/^(###\s+[^\n]+)\n(###\s+[^\n]+)$/gm, (_match, parent, child) => `${parent}\n**${child.replace(/^###\s+/, '')}**`)
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/(\w)\s*['\u2019'']\s*(\w)/g, "$1'$2")
    .replace(/(\s['\u2019'']|['\u2019'']\s)/g, (match) => match.trim())
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const fallbackCopyText = (text: string) => {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    if (!document.execCommand('copy')) {
      throw new Error('Copy command was rejected');
    }
  } finally {
    document.body.removeChild(textarea);
  }
};

export const copyTextToClipboard = async (text: string) => {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to legacy copy if browser clipboard access is blocked.
    }
  }

  fallbackCopyText(text);
};