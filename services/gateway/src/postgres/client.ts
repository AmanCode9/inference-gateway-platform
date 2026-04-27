import { Pool } from "pg";
import type { CachePostgresConfig } from "../config/index.js";
import type {
  PostgresCacheClient,
  PostgresQueryResult
} from "../cache/postgres-repository.js";

export interface PostgresPoolLike extends PostgresCacheClient {
  end(): Promise<void>;
}

export function createPostgresPool(config: CachePostgresConfig): PostgresPoolLike {
  const operationTimeoutMs = config.operationTimeoutMs;
  const pool = new Pool({
    connectionString: config.databaseUrl,
    connectionTimeoutMillis: operationTimeoutMs,
    statement_timeout: operationTimeoutMs,
    max: 5
  });

  return {
    query: async <Row>(
      text: string,
      values?: readonly unknown[]
    ): Promise<PostgresQueryResult<Row>> => {
      const result = await pool.query(text, values ? [...values] : undefined);

      return {
        rows: result.rows as Row[],
        rowCount: result.rowCount
      };
    },
    end: () => pool.end()
  };
}
