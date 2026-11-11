/** Client-safe links that start the server-side OAuth flow. */
export type ConnectableService = "Google" | "Office365" | "iCloud" | "IMAP";

export const connectUrl = (service: ConnectableService) =>
  `/api/accounts/connect?service=${encodeURIComponent(service)}`;

export const reconnectUrl = (accountId: string) =>
  `/api/accounts/connect?reconnect=${encodeURIComponent(accountId)}`;

/** Kept for existing callers: resolves to the connect route, not a provider URL. */
export const getAurinkoAuthorizationUrl = async (service: ConnectableService) => connectUrl(service);
