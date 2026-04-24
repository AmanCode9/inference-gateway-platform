import { createClient } from "redis";
import type { RedisConfig } from "../config/index.js";

export interface RedisLikeClient {
  readonly isOpen: boolean;
  eval(script: string, options: { readonly keys: readonly string[]; readonly arguments: readonly string[] }): Promise<unknown>;
  quit(): Promise<unknown>;
}

export async function connectRedisClient(config: RedisConfig): Promise<RedisLikeClient> {
  const client = createClient({
    url: config.url,
    socket: {
      connectTimeout: config.connectTimeoutMs,
      reconnectStrategy: false
    }
  });

  await client.connect();

  return {
    get isOpen() {
      return client.isOpen;
    },
    eval: (script, options) =>
      client.eval(script, {
        keys: [...options.keys],
        arguments: [...options.arguments]
      }),
    quit: () => client.quit()
  };
}
