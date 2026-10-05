import { catalogSnapshotSchema, billingAckSchema, type CatalogSnapshot, type BillingMessage, type BillingAck as Ack } from '@wylie/contracts';
import { ApiError } from '../errors.js';

export const snapshotSchema = catalogSnapshotSchema;
export type Snapshot = CatalogSnapshot;
export type BillingPayload = BillingMessage;
export type BillingAck = Ack;
export type External = { catalog(termId: string): Promise<Snapshot>; bill(payload: BillingPayload): Promise<BillingAck> };

export function httpExternal(config: { catalogBaseUrl: string; billingBaseUrl: string; externalToken: string }): External {
  return {
    async catalog(termId) {
      try {
        const url = new URL('/catalog/snapshot', config.catalogBaseUrl); url.searchParams.set('termId', termId);
        const response = await fetch(url, { headers: { authorization: `Bearer ${config.externalToken}` }, signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error('CATALOG_HTTP');
        const snapshot = snapshotSchema.parse(await response.json());
        if (snapshot.termId !== termId) throw new Error('CATALOG_TERM');
        return snapshot;
      } catch { throw new ApiError(503, 'CATALOG_UNAVAILABLE', '课程目录不可用，请稍后重试'); }
    },
    async bill(payload) {
      const response = await fetch(new URL('/billing', config.billingBaseUrl), { method: 'POST', headers: { authorization: `Bearer ${config.externalToken}`, 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error('BILLING_HTTP');
      const ack = billingAckSchema.parse(await response.json());
      if (ack.businessId !== payload.businessId || ack.version !== payload.version || ack.latestVersion < payload.version) throw new Error('BILLING_INVALID_ACK');
      return ack;
    },
  };
}
