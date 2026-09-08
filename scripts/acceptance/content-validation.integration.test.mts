import { describe, expect, it } from 'vitest';
import { EvidenceValidator, contactContentSupports } from '@imea/agents';
const id = '22000000-0000-4000-8000-000000000001';
const excerpt = 'The company distributes valves in Kazan.';
function check(statement: string, mode: 'observed' | 'inferred' | 'counter' = 'observed', relation?: 'paraphrase' | 'inference' | 'contradiction' | 'unsupported', quote = excerpt, stance = 'support') {
  return new EvidenceValidator().validate({ requiredConclusions: [{ key: 'claim', statement, mode, evidenceRefs: [id] }], allowedEvidenceIds: new Set([id]), evidenceContentById: new Map([[id, { excerpt, stance }]]), contentReviews: relation ? new Map([['claim', { key: 'claim', relation, reason: 'Controlled independent review response', quotes: [{ evidenceId: id, quote }] }]]) : undefined });
}
describe('content support contract, including independent semantic review boundary', () => {
  it('accepts original excerpt', () => expect(check(excerpt).valid).toBe(true));
  it('requires review for translation, then accepts a supported translation', () => {
    expect(check('该企业在喀山分销阀门。').valid).toBe(false);
    expect(check('该企业在喀山分销阀门。', 'observed', 'paraphrase').valid).toBe(true);
  });
  it('accepts faithful summary only with supporting original quote', () => expect(check('Kazan valve distributor', 'observed', 'paraphrase').valid).toBe(true));
  it('keeps inference distinct from observed fact', () => {
    expect(check('May be a potential valve customer', 'inferred', 'inference').valid).toBe(true);
    expect(check('Has purchasing intent', 'observed', 'inference').valid).toBe(false);
  });
  it('rejects an unrelated claim despite a valid citation', () => expect(check('The company manufactures certified steel pipes', 'observed', 'unsupported').valid).toBe(false));
  it('rejects a fabricated quote even when the review says supported', () => expect(check('Manufactures pipes', 'observed', 'paraphrase', 'Manufactures pipes').valid).toBe(false));
  it('allows opposing evidence only as contradiction, never positive support', () => {
    expect(check('The company does not distribute valves', 'counter', 'contradiction', excerpt, 'oppose').valid).toBe(true);
    expect(check(excerpt, 'observed', 'paraphrase', excerpt, 'oppose').valid).toBe(false);
  });
  it.each([
    ['+7 843 123 45 67', 'Phone: +7 (843) 123-45-67', true],
    ['+7 843 123 45 67', 'Phone: +7 (843) 123-45-678', false],
    ['Sales@Company.test', 'Email: sales@company.test', true],
    ['sales@company.test', 'Email: presales@company.test', false],
    ['https://company.test/contact', 'Public page', false],
    ['https://company.test/Contact', 'https://company.test/contact', false],
  ])('matches complete contact value %s', (value, text, expected) => expect(contactContentSupports(value, text)).toBe(expected));
  it('accepts the fetched official contact page URL as locator', () => expect(contactContentSupports('https://company.test/contact', 'Contact us', 'https://company.test/contact')).toBe(true));
});
