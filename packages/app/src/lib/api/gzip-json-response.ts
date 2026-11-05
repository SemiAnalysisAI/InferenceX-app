export const GZIP_JSON_CONTENT_TYPE = 'application/gzip';

export function readJsonResponse(response: Response): Promise<unknown> {
  const gzipBody = response.headers.get('Content-Type')?.startsWith(GZIP_JSON_CONTENT_TYPE)
    ? response.body
    : null;
  if (!gzipBody) return response.json();
  return new Response(gzipBody.pipeThrough(new DecompressionStream('gzip'))).json();
}
