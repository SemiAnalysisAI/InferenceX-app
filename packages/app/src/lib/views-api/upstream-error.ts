export class ViewsUpstreamError extends Error {
  readonly status: number;
  /** Set only for a first-party source outcome the caller can act on, such as an expired run. */
  readonly code?: string;

  constructor(status: number, message = 'Source data unavailable', code?: string) {
    super(message);
    this.name = 'ViewsUpstreamError';
    this.status = status;
    this.code = code;
  }
}
