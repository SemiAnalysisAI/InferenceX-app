import { hasNoSslFlag } from './cli-utils.js';
import { createAdminSql } from './etl/db-utils.js';
import { writeServerLogBlocks } from './etl/server-log-block-writer.js';

const sql = createAdminSql({ noSsl: hasNoSslFlag(), max: 1, onnotice: () => {} });

function flagValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || !/^\d+$/u.test(value)) throw new Error(`${name} requires a positive integer`);
  return value;
}

const limit = Number(flagValue('--limit') ?? Number.MAX_SAFE_INTEGER);
const onlyLogId = flagValue('--log-id');
const dryRun = process.argv.includes('--dry-run');

interface Candidate {
  log_id: string;
  file_name: string;
  primary: boolean;
}

const candidates = await sql<Candidate[]>`
  select log_id, file_name, is_primary as primary from (
    select s.id::text as log_id, s.file_name, true as is_primary, s.id
    from server_logs s
    where not exists (select 1 from server_log_block_files m
                      where m.server_log_id = s.id and m.file_name = s.file_name)
    union all
    select f.server_log_id::text, f.file_name, false, f.server_log_id
    from server_log_files f
    join server_logs s on s.id = f.server_log_id
    where f.file_name <> s.file_name
      and not exists (select 1 from server_log_block_files m
                      where m.server_log_id = f.server_log_id and m.file_name = f.file_name)
  ) files
  where ${onlyLogId}::bigint is null or id = ${onlyLogId}::bigint
  order by id desc, is_primary desc, file_name
  limit ${limit}
`;
console.log(`${candidates.length} file(s) to compact${dryRun ? ' (dry run)' : ''}`);

let done = 0;
for (const { log_id: logId, file_name: fileName, primary } of candidates) {
  const t0 = performance.now();
  const [{ chars }] = primary
    ? await sql<{ chars: string }[]>`
        select char_length(server_log)::text as chars from server_logs
        where id = ${logId} and file_name = ${fileName}`
    : await sql<{ chars: string }[]>`
        select char_length(log_text)::text as chars from server_log_files
        where server_log_id = ${logId} and file_name = ${fileName}`;
  const charCount = Number(chars);
  if (dryRun) {
    console.log(`  ${logId} ${fileName}: ${charCount} chars`);
    continue;
  }
  const written = await sql.begin((tx) =>
    writeServerLogBlocks(tx, logId, fileName, charCount, async (start, length) => {
      const [{ text }] = primary
        ? await tx<{ text: string }[]>`
            select substring(server_log from ${start + 1}::integer for ${length}::integer) as text
            from server_logs where id = ${logId}`
        : await tx<{ text: string }[]>`
            select substring(log_text from ${start + 1}::integer for ${length}::integer) as text
            from server_log_files where server_log_id = ${logId} and file_name = ${fileName}`;
      return text;
    }),
  );
  done += written ? 1 : 0;
  console.log(
    `  ${logId} ${fileName}: ${charCount} chars ${written ? 'compacted' : 'already block-backed'} ` +
      `in ${Math.round(performance.now() - t0)} ms`,
  );
}
console.log(`compacted ${done} file(s)`);
await sql.end();
