import { describe, expect, it, vi } from "vitest";

const pgMock = vi.hoisted(() => {
  const instances: MockPool[] = [];

  class MockPool {
    public ended = false;
    public queryText: string | undefined;
    public queryValues: readonly unknown[] | undefined;

    public constructor(public readonly config: unknown) {
      instances.push(this);
    }

    public async query<Row>(
      text: string,
      values?: readonly unknown[]
    ): Promise<{ readonly rows: readonly Row[]; readonly rowCount: number }> {
      this.queryText = text;
      this.queryValues = values;

      return {
        rows: [{ ok: true } as Row],
        rowCount: 1
      };
    }

    public async end(): Promise<void> {
      this.ended = true;
    }
  }

  return {
    instances,
    Pool: MockPool
  };
});

vi.mock("pg", () => ({
  Pool: pgMock.Pool
}));

import { createPostgresPool } from "../../src/postgres/client.js";

describe("createPostgresPool", () => {
  it("configures the cache pool with connection and statement timeouts", async () => {
    const pool = createPostgresPool({
      databaseUrl: "postgres://user:pass@localhost:5432/inference_gateway",
      operationTimeoutMs: 250
    });
    const instance = pgMock.instances[0];

    expect(instance?.config).toMatchObject({
      connectionString: "postgres://user:pass@localhost:5432/inference_gateway",
      connectionTimeoutMillis: 250,
      statement_timeout: 250,
      max: 5
    });

    await expect(pool.query("SELECT 1", ["value"])).resolves.toEqual({
      rows: [{ ok: true }],
      rowCount: 1
    });
    expect(instance?.queryText).toBe("SELECT 1");
    expect(instance?.queryValues).toEqual(["value"]);

    await pool.end();
    expect(instance?.ended).toBe(true);
  });
});
