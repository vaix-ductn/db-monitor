export interface CdcEvent {
  table: string;
  database?: string;
  operation: 'c' | 'u' | 'd' | 'r';
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  timestamp: string;
}
