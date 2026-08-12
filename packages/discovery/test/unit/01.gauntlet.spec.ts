import { describe, expect, it } from 'vitest';
import { cleanEntry } from '../../src/validation.js';
import {
  CLEAN_RESOURCE,
  ENCODED_TRAVERSAL_ROUTE_TEMPLATE,
  INVALID_ENVELOPE,
  INVALID_TAG_LIST,
  LOOPBACK_ICON_URL,
  MULTI_DEFECT_RESOURCE,
  OVERSIZED_SERVICE_NAME,
  PLAIN_TRAVERSAL_ROUTE_TEMPLATE,
} from '../fixtures/resources.js';

/**
 * Cites RFP 3.2 / architecture §4.2 (catalog integrity gauntlet). Reproduces
 * the manual review's findings as automated assertions: field-level defects
 * soft-drop just the bad field and keep the rest of the entry; only an
 * invalid envelope hard-rejects the whole entry.
 */
describe('gauntlet: field-level soft-drop, envelope-level hard-reject', () => {
  it('a fully clean resource passes with nothing dropped', () => {
    const result = cleanEntry(CLEAN_RESOURCE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dropped).toEqual([]);
    expect(result.entry.serviceName).toBe('WeatherCo');
    expect(result.entry.routeTemplate).toBe('/api/forecast');
  });

  it('an oversized serviceName is dropped, the rest of the entry catalogs', () => {
    const result = cleanEntry(OVERSIZED_SERVICE_NAME);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dropped).toEqual(['serviceName']);
    expect(result.entry.serviceName).toBeUndefined();
    expect(result.entry.resource).toBe(OVERSIZED_SERVICE_NAME.resource);
  });

  it('an invalid tag list is dropped, valid-shaped tags among it are not silently kept', () => {
    const result = cleanEntry(INVALID_TAG_LIST);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // the fixture's only structurally valid, non-duplicate tag
    expect(result.entry.tags).toEqual(['valid-tag']);
  });

  it('a loopback/IP-literal iconUrl alone drops only that field', () => {
    const result = cleanEntry(LOOPBACK_ICON_URL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dropped).toEqual(['iconUrl']);
    expect(result.entry.iconUrl).toBeUndefined();
  });

  it('a plain path-traversal routeTemplate is dropped', () => {
    const result = cleanEntry(PLAIN_TRAVERSAL_ROUTE_TEMPLATE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dropped).toEqual(['routeTemplate']);
    expect(result.entry.routeTemplate).toBeUndefined();
  });

  it('a percent-encoded path-traversal routeTemplate is caught identically to the plain case (decode happens before the traversal check, not after)', () => {
    const result = cleanEntry(ENCODED_TRAVERSAL_ROUTE_TEMPLATE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dropped).toEqual(['routeTemplate']);
    expect(result.entry.routeTemplate).toBeUndefined();
  });

  it('an envelope with no accepts is hard-rejected with a specific reason, not soft-dropped', () => {
    const result = cleanEntry(INVALID_ENVELOPE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('accepts_missing');
  });

  it('a combination of defects drops exactly the defective fields and no others', () => {
    const result = cleanEntry(MULTI_DEFECT_RESOURCE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dropped.sort()).toEqual(['iconUrl', 'routeTemplate', 'serviceName'].sort());
    expect(result.entry.description).toBe(MULTI_DEFECT_RESOURCE.description);
    expect(result.entry.tags).toEqual(['fine-tag']);
  });
});
