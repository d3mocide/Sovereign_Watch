export const syntaxHighlightJson = (jsonStr: string): string => {
  try {
    // If it's already a stringified JSON, parse it to ensure consistent formatting
    const obj = JSON.parse(jsonStr);
    const prettyJson = JSON.stringify(obj, null, 2);

    // Escape HTML to prevent XSS
    const escapedJson = prettyJson
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    return escapedJson.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
      (match) => {
        let cls = 'text-green-400'; // number
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = 'text-blue-400'; // key
          } else {
            cls = 'text-yellow-300'; // string
          }
        } else if (/true|false/.test(match)) {
          cls = 'text-purple-400'; // boolean
        } else if (/null/.test(match)) {
          cls = 'text-gray-400'; // null
        }
        return `<span class="${cls}">${match}</span>`;
      }
    );
  } catch (e) {
    // Fallback if it's not valid JSON, but still escape it to prevent XSS
    return jsonStr
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
};
