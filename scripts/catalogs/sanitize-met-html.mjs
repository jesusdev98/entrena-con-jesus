// Inspect snapshot content in memory; never put matched values in diagnostics.
export const placeholder = 'REDACTED_NON_RUNTIME_TOKEN';
const jwtPattern = /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,}(?![A-Za-z0-9_-])/g;
const inputPattern = /<input\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi;
const attributePattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function jsonSegment(segment) {
  const bytes = Buffer.from(segment, 'base64url');
  if (bytes.toString('base64url') !== segment) return null;
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

function jwtCandidate(candidate) {
  try {
    const [header, payload, signature] = candidate.split('.');
    const metadata = jsonSegment(header);
    const claims = jsonSegment(payload);
    return metadata !== null && typeof metadata === 'object' && !Array.isArray(metadata) &&
      typeof metadata.alg === 'string' && metadata.alg.length > 0 && metadata.alg.toLowerCase() !== 'none' &&
      typeof metadata.typ === 'string' && metadata.typ.toLowerCase() === 'jwt' &&
      claims !== null && typeof claims === 'object' && !Array.isArray(claims) && signature.length >= 16;
  } catch { return false; }
}

function targetValues(html) {
  const values = [];
  for (const tag of html.matchAll(inputPattern)) {
    const attributes = [...tag[0].matchAll(attributePattern)];
    const attribute = name => attributes.filter(match => match[1].toLowerCase() === name);
    if (attribute('name').length !== 1 || (attribute('name')[0][2] ?? attribute('name')[0][3]) !== 'jetpack_contact_form_jwt') continue;
    if (attribute('type').length !== 1 || (attribute('type')[0][2] ?? attribute('type')[0][3]).toLowerCase() !== 'hidden' || attribute('value').length !== 1) {
      throw new Error('Unexpected MET form token field');
    }
    const value = attribute('value')[0];
    const quoted = value[2] !== undefined ? `"${value[2]}"` : `'${value[3]}'`;
    const start = tag.index + value.index + value[0].indexOf(quoted) + 1;
    values.push({ start, end: start + quoted.length - 2, value: value[2] ?? value[3] });
  }
  return values;
}

export function inspectMetHtml(html) {
  const jwt = [...html.matchAll(jwtPattern)].filter(match => jwtCandidate(match[0]));
  const targets = targetValues(html);
  return { jwt: jwt.length, targets: targets.length, safeTarget: targets.length === 1 &&
    jwtCandidate(targets[0].value) && jwt.length === 1 && jwt[0][0] === targets[0].value && jwt[0].index === targets[0].start };
}

export function sanitizeMetHtml(html) {
  const before = inspectMetHtml(html);
  if (before.jwt === 0 && before.targets === 1 && targetValues(html)[0].value === placeholder) return { sanitized: html, count: 0 };
  if (!before.safeTarget) throw new Error('Expected exactly one valid JWT in the designated hidden MET form field');
  const [{ start, end, value }] = targetValues(html);
  const sanitized = html.slice(0, start) + placeholder + html.slice(end);
  const after = inspectMetHtml(sanitized);
  if (after.jwt !== 0 || after.targets !== 1 || targetValues(sanitized)[0].value !== placeholder) {
    throw new Error('MET source sanitization incomplete');
  }
  return { sanitized, count: 1, originalValue: value };
}
