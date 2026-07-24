export interface RuntimeMetadata {
  kv_offloading?: string;
  kv_offload_backend?: string;
  kv_offload_backend_version?: string;
  kv_p2p_transfer?: string;
  router_name?: string;
  router_version?: string;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/** Normalize legacy strings and current `{ name, version? }` component metadata. */
function componentMetadata(raw: unknown): { name?: string; version?: string } {
  const legacyName = nonEmptyString(raw);
  if (legacyName) return { name: legacyName };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const metadata = raw as Record<string, unknown>;
  return {
    name: nonEmptyString(metadata.name),
    version: nonEmptyString(metadata.version),
  };
}

/** Extract runtime components into the flat metrics representation consumed by the app. */
export function extractRuntimeMetadata(row: Record<string, unknown>): RuntimeMetadata {
  const metadata: RuntimeMetadata = {};
  const kvOffloading = nonEmptyString(row.kv_offloading);
  if (kvOffloading) metadata.kv_offloading = kvOffloading;

  const backend = componentMetadata(row.kv_offload_backend);
  if (backend.name) {
    metadata.kv_offload_backend = backend.name;
    if (backend.version) metadata.kv_offload_backend_version = backend.version;
  }

  const transfer = nonEmptyString(row.kv_p2p_transfer);
  if (transfer) metadata.kv_p2p_transfer = transfer;

  const router = componentMetadata(row.router);
  if (router.name) {
    metadata.router_name = router.name;
    if (router.version) metadata.router_version = router.version;
  }

  return metadata;
}
