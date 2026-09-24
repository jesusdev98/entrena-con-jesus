export function* csvRows(text) {
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted;
    } else if (!quoted && (char === ',' || char === '\n')) {
      row.push(field.replace(/\r$/, '')); field = '';
      if (char === '\n') { yield row; row = []; }
    } else field += char;
  }
  if (quoted) throw new Error('Unterminated CSV quoted field');
  if (field || row.length) { row.push(field.replace(/\r$/, '')); yield row; }
}
