import { apiRouteCatalog } from './api-route-catalog';
import { captureServer } from './analytics-server';

const routes = apiRouteCatalog
  .filter(
    (route) =>
      route.method === 'GET' &&
      (route.classification === 'published-read' || route.path === '/api/openapi.json'),
  )
  .map(({ path }) => ({
    path,
    // Catalog templates keep private path IDs out of analytics.
    segments: path.split('/'),
  }));

const marker =
  /^inferencex-(?<source>cli|skill)\/(?<version>(?:0|[1-9]\d{0,3})\.(?:0|[1-9]\d{0,3})\.(?:0|[1-9]\d{0,3}))$/u;

/** Attribution is self-reported, never authentication or a user identifier. */
export function captureClientRequest(request: Request): Promise<void> | undefined {
  const environment = process.env.VERCEL_ENV;
  if (
    request.method !== 'GET' ||
    !['production', 'preview'].includes(environment ?? '') ||
    process.env.INFERENCEX_REQUEST_ANALYTICS === '0' ||
    !process.env.NEXT_PUBLIC_POSTHOG_KEY
  )
    return;

  const client = request.headers.get('user-agent');
  if (!client || client.length > 64) return;
  const match = marker.exec(client);
  if (!match?.groups) return;
  const traffic = request.headers.get('x-inferencex-traffic') ?? 'normal';
  if (!['normal', 'ci', 'validation'].includes(traffic)) return;
  const segments = new URL(request.url).pathname.split('/');
  const route = routes.find(
    (candidate) =>
      candidate.segments.length === segments.length &&
      candidate.segments.every((segment, index) =>
        segment.startsWith('{') ? segments[index].length > 0 : segment === segments[index],
      ),
  );
  if (!route) return;

  return captureServer(
    'cli_api_request_received',
    {
      source: match.groups.source,
      version: match.groups.version,
      route: route.path,
      environment,
      traffic,
      $process_person_profile: false,
      $geoip_disable: true,
    },
    'inferencex-client-request-volume',
  );
}
