# Client request analytics

`cli_api_request_received` counts marked public GET requests reaching the app's
routing proxy, before the CDN cache. `apiRouteCatalog` defines the eligible
`published-read` routes; `/api/openapi.json` is included for discovery. Handlers
never duplicate this event. Each retry counts again. Delivery is best effort,
not exactly-once accounting; blocked traffic, unmarked/opted-out requests and
failed deliveries are absent. It does not measure users, installs, skill
invocations, analysis success, final HTTP status or offline usage.

## Attribution and privacy

The packaged `request-headers.mjs` helper reads its version from `integrity.json`.
It marks first-party HTTPS requests only. Formal commands use
`User-Agent: inferencex-cli/<version>`; the six raw API recipes use
`inferencex-skill/<version>`. A skill invoking the CLI counts as `source=cli`.
`X-InferenceX-Traffic` is `normal`, `ci`, or `validation`. These headers are
self-reported, spoofable attribution, never authentication.

The event contains only `source`, bounded numeric `version`, catalog `route`
template, server-owned `environment`, and `traffic`. It uses a fixed aggregate
`distinct_id=inferencex-client-request-volume`, `$process_person_profile=false`,
`$geoip_disable=true`, and the existing `$lib=inferencex-server` property. No
query values, concrete path IDs, prompts, local paths, spreadsheet/response
contents, credentials, cookies, IPs, or persistent user/install IDs are copied.
Normal platform access logs are outside this analytics control.

`INFERENCEX_TELEMETRY=0` or `DO_NOT_TRACK=1` removes both attribution headers in
formal commands (including retries) and raw recipes. For demos and acceptance
checks set `INFERENCEX_TRAFFIC=validation`; `CI` automatically selects `ci` unless
it is empty, `0` or `false`. Release verifier subprocesses explicitly use
validation. Independent maintainer scripts without package markers remain
uncounted. Invalid traffic values suppress attribution.

## Delivery

Reuse `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` from the existing
PostHog project. Collection requires `VERCEL_ENV=production|preview`; local
servers are disabled by default. `INFERENCEX_REQUEST_ANALYTICS=0` is the server
kill switch. Missing keys also disable this path.

`proxy.ts` attaches one capture Promise to `NextFetchEvent.waitUntil` and returns
immediately. The capture has a three-second timeout, rejects redirects and does
not retry. Rejection, timeout or a non-2xx analytics response does not alter the
API result. Response data, CDN policy, cache keys and embed behavior are unchanged.
The proxy cannot observe the eventual HTTP status or whether CDN lookup hits.

## Weekly report

Use **total events**, never unique users, for `cli_api_request_received` filtered
to `environment=production` and `traffic=normal`. Group by UTC Monday weeks and
label the current week partial. Separate transport, version and route breakdowns;
keep `/api/openapi.json` visibly separate from data requests when interpreting
usage. Existing general-purpose browser reports are not an adoption metric.

Equivalent HogQL (explicit UTC; `1` makes Monday the week start):

```sql
SELECT toStartOfWeek(toTimeZone(timestamp, 'UTC'), 1) AS week_start_utc,
       if(week_start_utc = toStartOfWeek(toTimeZone(now(), 'UTC'), 1), 'partial', 'complete') AS week_status,
       count() AS received_requests
FROM events
WHERE event = 'cli_api_request_received'
  AND properties.environment = 'production'
  AND properties.traffic = 'normal'
GROUP BY week_start_utc
ORDER BY week_start_utc
```

## Deployment acceptance

The existing US Cloud project was inspected on 2026-09-22 before implementation.
Ingestion filtering was off and Discard IP was on. The active GeoIP transformation
runs before discard and honors `$geoip_disable`, so discarding IP alone is not a
substitute for that event property. No project settings were changed. Recheck
project/host, transformations, event payload and report filters before PR readiness.
The inspected Vercel project configures PostHog in production only; a default
preview therefore emits nothing. For an isolated preview acceptance deployment,
supply the public project key and ingestion host as deployment-only overrides.
No personal API key or change to shared project settings is needed.

Deploy the server before publishing clients with attribution. On a deployed
preview, send two marked `validation` GETs to the same safe cacheable endpoint,
retain MISS and HIT response headers, and confirm two matching PostHog events
with the exact allowed properties and preview environment. No cache purge,
response rewrite or extra query parameter is required. These events must remain
outside the normal production chart. A local proxy unit test cannot establish CDN
behavior. Until deployed evidence is recorded, cache/ingestion acceptance remains
pending. This change does not authorize merging or publishing the package.

## 中文说明

统计对象是到达缓存前入口、带来源标识的公开 GET 请求，每次重试单独计数；统计尽力交付，不能据此推算
用户数、安装量、分析成功率或最终 HTTP 状态。只采集包版本、客户端类型（CLI 或 skill）、接口路径模板、
服务端部署环境与限定类别的流量标记；使用固定匿名聚合身份，并关闭个人档案处理和 GeoIP。

设置 `INFERENCEX_TELEMETRY=0` 或 `DO_NOT_TRACK=1` 后，CLI 与原始 API 示例均不发送来源
标识；演示及验收设置 `INFERENCEX_TRAFFIC=validation`，CI 流量自动单独归类。
服务端设置 `INFERENCEX_REQUEST_ANALYTICS=0` 可关闭统计。统计服务不可用不影响数据查询。来源请求头由客户端自行声明、可能被伪造，不能用于身份验证。

周报以 UTC 周一为每周起点，仅统计生产环境普通流量的事件总数，当前周标为未结束；不使用独立用户数。
发布客户端前，先部署服务端并确认同一接口的冷、热缓存请求都入账，测试流量不进入使用量报表。
本地测试不能代替部署后的 CDN 与 PostHog 核验。
