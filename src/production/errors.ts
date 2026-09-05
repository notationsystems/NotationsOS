/** Messages/details are authored by the backend; never wrap uncontrolled diagnostics. */
export class ProductionError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400, readonly details?: unknown) {
    super(message);
    this.name = 'ProductionError';
  }
}
