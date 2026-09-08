const normalize = (value: string) => value.normalize('NFKC').trim();

/** Match whole public contact values; formatting normalization must not invent digits,
 * local telephone prefixes, addresses, or additional URL path segments. */
export function contactContentSupports(value: string, excerpt: string, sourceUrl?: string): boolean {
  const contact = normalize(value);
  const text = normalize(excerpt);
  if (/^https?:\/\//i.test(contact)) {
    const canonical = (candidate: string) => {
      try { const url = new URL(candidate); url.hash = ''; return url.href; } catch { return undefined; }
    };
    const expected = canonical(contact);
    return Boolean(expected && [...text.matchAll(/https?:\/\/[^\s<>"'，。]+/gi)].some(match => canonical(match[0]) === expected) || expected && sourceUrl && canonical(sourceUrl) === expected);
  }
  if (contact.includes('@')) return [...text.matchAll(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)].some(match => match[0].toLowerCase() === contact.toLowerCase());
  if (/^\+?[\d\s().-]{7,}$/.test(contact)) {
    const digits = contact.replace(/\D/g, '');
    if (digits.length < 7) return false;
    return [...text.matchAll(/\+?\d[\d\s().-]{5,}\d/g)].some(match => match[0].replace(/\D/g, '') === digits);
  }
  return text.replace(/\s+/g, ' ') === contact.replace(/\s+/g, ' ');
}
