/** RFC 6266 ASCII fallback and RFC 8187 UTF-8 filename. Never put raw user text in headers. */
export function downloadDisposition(filename: string): string {
  const safe = Buffer.from(Array.from(filename, char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 || '"\\/'.includes(char) ? '_' : char).join(''), 'utf8').toString('utf8').replace(/^\.+/, '_');
  const fallback = safe.replace(/[^\x20-\x7e]/g, '_') || 'download';
  const encoded = encodeURIComponent(safe || 'download').replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
