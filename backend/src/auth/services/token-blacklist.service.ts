import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { createHash } from "crypto";

/**
 * TokenBlacklistService — invalidación de refresh tokens (logout, rotation, theft).
 *
 * Por qué blacklist en lugar de "revocar todo en DB":
 *  - JWTs son stateless por diseño. La única forma de revocar un JWT antes
 *    de su expiración natural es chequear contra una blacklist.
 *  - Solo guardamos el `jti` (JWT ID) o un hash del token, no el token completo.
 *  - El TTL del entry coincide con el `exp` del token: una vez expirado,
 *    el JWT verification falla por su cuenta y podemos eliminar el entry.
 *
 * Implementación:
 *  - Interface `KvStore` permite swap fácil entre in-memory (dev) y Redis (prod).
 *  - In-memory: Map con TTL automático via setTimeout (suficiente para 1 instancia).
 *  - Redis (prod): comentado pero listo para activar con `ioredis`.
 *
 * Tamaño esperado: ~1 KB por token blacklisted. Con TTL=7d y ~1000 logouts/día,
 * el total en memoria es <1 MB → in-memory es viable hasta ~10k usuarios activos.
 */

interface KvStore {
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}

// ============================================================
// IN-MEMORY IMPLEMENTATION (dev / 1-instancia)
// ============================================================

class InMemoryKvStore implements KvStore {
  private readonly store = new Map<
    string,
    { value: string; expiresAt: number }
  >();
  private readonly timers = new Map<string, NodeJS.Timeout>();

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.store.set(key, { value, expiresAt });

    // Cancelar timer previo si existe
    const prev = this.timers.get(key);
    if (prev) clearTimeout(prev);

    // Programar expiración automática
    const timer = setTimeout(() => {
      this.store.delete(key);
      this.timers.delete(key);
    }, ttlSeconds * 1000);
    // Permite al proceso terminar aunque haya timers pendientes
    timer.unref?.();
    this.timers.set(key, timer);
  }

  async has(key: string): Promise<boolean> {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      const t = this.timers.get(key);
      if (t) clearTimeout(t);
      this.timers.delete(key);
      return false;
    }
    return true;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
    const t = this.timers.get(key);
    if (t) clearTimeout(t);
    this.timers.delete(key);
  }

  destroy(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.store.clear();
  }
}

// ============================================================
// REDIS IMPLEMENTATION (prod / multi-instancia)
// ============================================================

class RedisKvStore implements KvStore {
  private client: import("ioredis").Redis;

  constructor(redisUrl: string) {
    // ioredis is a transitive dependency of bull/socket.io — always present
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Redis = require("ioredis");
    this.client = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
    });
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, "EX", ttlSeconds);
  }

  async has(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  async quit(): Promise<void> {
    await this.client.quit();
  }
}

// ============================================================
// SERVICE
// ============================================================

@Injectable()
export class TokenBlacklistService implements OnModuleDestroy {
  private readonly logger = new Logger(TokenBlacklistService.name);
  private readonly store: KvStore;

  constructor() {
    if (process.env.REDIS_URL) {
      this.store = new RedisKvStore(process.env.REDIS_URL);
      this.logger.log("TokenBlacklistService: usando Redis.");
    } else {
      this.store = new InMemoryKvStore();
      if (process.env.NODE_ENV === "production") {
        this.logger.warn(
          "TokenBlacklistService: usando in-memory en producción. " +
            "Configurar REDIS_URL para deployments multi-instancia.",
        );
      }
    }
  }

  /**
   * Marca un token como revocado.
   * @param jti — JWT ID (claim `jti` del token)
   * @param ttlSeconds — TTL = tiempo restante hasta el `exp` del token
   */
  async revoke(jti: string, ttlSeconds: number): Promise<void> {
    if (!jti) return;
    if (ttlSeconds <= 0) return; // ya expiró por sí solo
    const key = this.makeKey(jti);
    await this.store.set(key, "1", ttlSeconds);
  }

  /**
   * Verifica si un token está en la blacklist.
   */
  async isRevoked(jti: string): Promise<boolean> {
    if (!jti) return false;
    return this.store.has(this.makeKey(jti));
  }

  /**
   * Helper para revocar a partir del JWT completo.
   * Hashea el token (SHA-256) si no tiene `jti` claim.
   */
  async revokeRaw(token: string, ttlSeconds: number): Promise<void> {
    const id = this.tokenToId(token);
    await this.revoke(id, ttlSeconds);
  }

  async isRawRevoked(token: string): Promise<boolean> {
    const id = this.tokenToId(token);
    return this.isRevoked(id);
  }

  // ----------------------------------------------------------
  // PRIVATE
  // ----------------------------------------------------------

  /**
   * Convierte un token (potencialmente largo) en una clave estable y compacta.
   * Usar SHA-256 evita guardar el token completo en memoria.
   */
  private tokenToId(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private makeKey(jti: string): string {
    return `blacklist:${jti}`;
  }

  async onModuleDestroy() {
    if (this.store instanceof InMemoryKvStore) {
      this.store.destroy();
    } else if (this.store instanceof RedisKvStore) {
      await this.store.quit();
    }
  }
}
