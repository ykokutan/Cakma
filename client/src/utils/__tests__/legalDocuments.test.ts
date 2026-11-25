import { describe, it, expect } from 'vitest';
import {
  LEGAL_DOCUMENTS,
  LEGAL_DOCUMENTS_VERSION,
  resolveLegalDocFromLocation,
} from '../../data/legalDocuments';

describe('legalDocuments', () => {
  it('contains all 5 comprehensive Turkish legal documents with detailed sections', () => {
    expect(LEGAL_DOCUMENTS_VERSION).toBe('1.1.0');
    const ids = LEGAL_DOCUMENTS.map((d) => d.id);
    expect(ids).toEqual(['terms', 'privacy', 'kvkk', 'community', 'cookies']);

    for (const doc of LEGAL_DOCUMENTS) {
      expect(doc.title.length).toBeGreaterThan(5);
      expect(doc.sections.length).toBeGreaterThanOrEqual(6);
      for (const sec of doc.sections) {
        expect(sec.heading.length).toBeGreaterThan(2);
        expect(sec.paragraphs.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('resolves legal document IDs accurately from query parameters and pathnames', () => {
    expect(resolveLegalDocFromLocation('/', '?legal=privacy')).toBe('privacy');
    expect(resolveLegalDocFromLocation('/', '?legal=kvkk')).toBe('kvkk');
    expect(resolveLegalDocFromLocation('/', '?doc=cookies')).toBe('cookies');
    expect(resolveLegalDocFromLocation('/terms', '')).toBe('terms');
    expect(resolveLegalDocFromLocation('/gizlilik', '')).toBe('privacy');
    expect(resolveLegalDocFromLocation('/legal/', '')).toBe('terms');
    expect(resolveLegalDocFromLocation('/', '')).toBeNull();
  });
});
