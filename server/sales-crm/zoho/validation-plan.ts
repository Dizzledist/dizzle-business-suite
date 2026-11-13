import { zohoOrganizationId, zohoScopes } from './config';
import { exactInstant } from '../reporting/model';

export function prepareThreeInvoiceTest(ids: readonly string[]) {
  if (ids.length !== 3 || new Set(ids).size !== 3 || ids.some(id => !/^[1-9]\d{0,39}$/.test(id))) {
    throw new RangeError('Select three distinct valid Zoho invoice IDs.');
  }
  return {
    organizationId: zohoOrganizationId, scopes: [...zohoScopes], requiresSeparateApproval: true,
    maxInventoryAttempts: 7, inventoryRetries: 0, allowPdf: false, allowListing: false,
    requests: [
      { method: 'GET', path: '/organizations' },
      ...ids.flatMap(id => [
        { method: 'GET', path: '/invoices/' + id + '?organization_id=' + zohoOrganizationId },
        { method: 'GET', path: '/invoices/' + id + '/comments?organization_id=' + zohoOrganizationId },
      ]),
    ],
  };
}

type HistoryEvent = {
  comment_id: string; operation_type: string | null; comment_type: string | null; date: string | null; time: string | null;
};
// Provider operation labels have no accepted success or first-send mapping yet.
export function observeInvoiceHistory(events: readonly HistoryEvent[]) {
  return events.map(event => ({
    sourceEventId: event.comment_id, operation: event.operation_type, type: event.comment_type,
    sourceDate: event.date, sourceTime: event.time,
    candidateAt: exactInstant(event.date) === null ? null : event.date,
    verification: 'pending' as const,
    successful: null, firstSend: null,
  }));
}
