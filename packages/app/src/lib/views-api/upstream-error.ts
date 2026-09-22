export class ViewsUpstreamError extends Error {
  readonly status: number;

  constructor(status: number) {
    super('Source data unavailable');
    this.name = 'ViewsUpstreamError';
    this.status = status;
  }
}
