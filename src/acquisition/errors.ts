/** Only backend-authored codes/messages may cross the source acquisition boundary. */
export class SourceConnectorError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) {
    super(message);
    this.name = 'SourceConnectorError';
  }
}
