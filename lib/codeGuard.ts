/**
 * Scans transformed JS code for prohibited global variables, network calls,
 * and dangerous execution mechanisms before running in browser sandbox.
 */

const FORBIDDEN_IDENTIFIERS = [
  'window',
  'document',
  'globalThis',
  'self',
  'top',
  'parent',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'navigator',
  'location',
  'eval',
  'Function',
  'constructor',
  '__proto__',
  'importScripts',
  'Worker',
  'postMessage',
  'sendBeacon',
];

export function scanCode(code: string): string | null {
  if (!code) return null;

  // Check for dynamic import(...)
  if (/\bimport\s*\(/i.test(code)) {
    return 'Dynamic import() statements are forbidden in component code.';
  }

  for (const identifier of FORBIDDEN_IDENTIFIERS) {
    // Regex for word boundary matching identifier
    const regex = new RegExp(`\\b${identifier}\\b`);
    if (regex.test(code)) {
      return `Forbidden access to identifier or global property "${identifier}".`;
    }
  }

  return null;
}
