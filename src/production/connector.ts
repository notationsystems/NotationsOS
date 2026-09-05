/** Future transport declaration only. No live connector or scheduler is activated. */
export interface ConnectorDeclaration {
  schema: 'payload.connector-declaration.v1';
  id: string;
  version: string;
  transport: 'LOCAL_BYTES' | 'API' | 'DOWNLOAD' | 'FEED' | 'BROWSER_EXTRACTION';
  supportedScope: { domains: string[]; entityTypes: string[]; geographies: string[]; mediaTypes: string[] };
  pagination: { mode: 'NONE' | 'CURSOR' | 'PAGE'; maxPages: number; maxRecords: number };
  limits: { inputBytes: number; outputBytes: number; timeoutMs: number; concurrency: number };
  retry: { maxAttempts: number; backoffMs: number; identity: 'EXACT_REQUEST'; cursorRecovery: boolean };
  credentialReference: string | null;
  extractionVersion: string;
  activation: 'UNAVAILABLE' | 'LOCAL_DEVELOPMENT';
}

/** Transports return original bytes, never a normalized/admitted state or caller-selected path. */
export interface ConnectorCapture {
  content: Uint8Array;
  mediaType: string;
  sourceLocator: string | null;
  cursor: string | null;
  completeWithinDeclaredScope: boolean;
}
