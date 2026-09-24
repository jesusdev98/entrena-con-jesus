import { JSDOM } from 'jsdom';

const allowed = new Set(['svg', 'g', 'path', 'defs', 'clipPath', 'mask', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'linearGradient', 'radialGradient', 'stop', 'title', 'desc']);
export function validateSvg(text, name) {
  if (/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(text)) throw new Error(`External XML declaration: ${name}`);
  const dom = new JSDOM(text, { contentType: 'image/svg+xml' });
  try {
    const root = dom.window.document.documentElement;
    if (root.localName !== 'svg' || root.namespaceURI !== 'http://www.w3.org/2000/svg' || root.getAttribute('viewBox') !== '0 0 512 512') throw new Error(`Invalid canvas: ${name}`);
    for (const element of root.querySelectorAll('*')) {
      if (!allowed.has(element.localName) || element.namespaceURI !== root.namespaceURI) throw new Error(`Unsupported SVG tag ${element.localName}: ${name}`);
    }
    for (const element of [root, ...root.querySelectorAll('*')]) for (const attribute of element.attributes) {
      if (/^on|href$|^style$|^xml:base$/i.test(attribute.name) || /javascript:|data:|@import|\\|\/\*/i.test(attribute.value)) throw new Error(`Active or external SVG content: ${name}`);
      if (/url\s*\(/i.test(attribute.value)) {
        const local = /^url\(\s*['"]?#([A-Za-z_][\w:.-]*)['"]?\s*\)$/i.exec(attribute.value);
        if (!local || !root.ownerDocument.getElementById(local[1])) throw new Error(`External or unresolved SVG reference: ${name}`);
      }
    }
    if (!root.querySelector('path')) throw new Error(`Empty artwork: ${name}`);
  } finally { dom.window.close(); }
}
