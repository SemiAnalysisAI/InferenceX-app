import postgres, { type Options } from 'postgres';
import { resolveDatabaseConnection } from '../connection.js';

export type Sql = ReturnType<typeof postgres>;

export function createAdminSql(
  opts: Omit<Options<Record<string, postgres.PostgresType>>, 'ssl'> & {
    readonly?: boolean;
    noSsl?: boolean;
    envVar?: string;
    url?: string;
  } = {},
): Sql {
  const { readonly, noSsl, envVar: envVarOverride, url, ...pgOpts } = opts;
  const envVar = envVarOverride ?? (readonly ? 'DATABASE_READONLY_URL' : 'DATABASE_WRITE_URL');
  const connection = resolveDatabaseConnection({
    envVar,
    url,
    driver: 'postgres',
    ssl: noSsl ? false : process.env.DATABASE_SSL,
  });
  return postgres(connection.url, {
    ...pgOpts,
    ssl: connection.ssl,
  });
}
