import { spawnSync } from "child_process";
import { existsSync, unlinkSync, writeFileSync } from "fs";
import crypto from "crypto";

const required = (name, fallback) => {
  const value = Bun.env[name] ?? fallback;
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const BUCKET = required("BUCKET");
const REGION = required("REGION");
const ENDPOINT = required("ENDPOINT");
const ACCESS_KEY_ID = required("ACCESS_KEY_ID");
const SECRET_ACCESS_KEY = required("SECRET_ACCESS_KEY");
const ENCRYPTION_KEY_HEX = required("BACKUP_ENCRYPTION_KEY");
const RESTORE_PGHOST = Bun.env.RESTORE_PGHOST || "nvet-restore-temp-postgres.railway.internal";
const RESTORE_PGPORT = Bun.env.RESTORE_PGPORT || "5432";
const RESTORE_PGUSER = required("RESTORE_PGUSER", "restoreuser");
const RESTORE_PGPASSWORD = required("RESTORE_PGPASSWORD");
const RESTORE_PGDATABASE = Bun.env.RESTORE_PGDATABASE || "nvet_restore";
const MAX_BACKUP_AGE_HOURS = Number(Bun.env.MAX_BACKUP_AGE_HOURS || "24");

if (!/^[0-9a-fA-F]{64}$/.test(ENCRYPTION_KEY_HEX)) {
  throw new Error("BACKUP_ENCRYPTION_KEY must be a 32-byte hex key");
}

const s3 = new Bun.S3Client({
  endpoint: ENDPOINT,
  region: REGION,
  accessKeyId: ACCESS_KEY_ID,
  secretAccessKey: SECRET_ACCESS_KEY,
  bucket: BUCKET,
});

const run = (command, args, env = process.env) => {
  const result = spawnSync(command, args, { env, encoding: "utf8", timeout: 600000 });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
  return (result.stdout || "").trim();
};

const listAll = async () => {
  const objects = [];
  let continuationToken;
  do {
    const page = await s3.list({ prefix: "", continuationToken });
    for (const object of page.objects || []) {
      objects.push({
        key: object.key,
        size: object.size || 0,
        lastModified: new Date(object.lastModified || object.mtime || 0),
      });
    }
    continuationToken = page.continuationToken;
  } while (continuationToken);
  return objects;
};

const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

const cleanup = (paths) => {
  for (const path of paths) {
    try {
      if (existsSync(path)) unlinkSync(path);
    } catch {}
  }
};

console.log("[VERIFY] ===== RESTORE VERIFICATION DRILL START =====");
const tmp = ["/tmp/nvet-restore.dump", "/tmp/nvet-backup.enc", "/tmp/nvet-backup.meta.json"];

try {
  const objects = await listAll();
  const encrypted = objects
    .filter((object) => object.key.endsWith(".enc"))
    .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

  if (!encrypted.length) throw new Error(`No encrypted backups found in bucket ${BUCKET}`);

  const latest = encrypted[0];
  const metaKey = latest.key.replace(/\.enc$/, ".meta.json");
  if (!objects.some((object) => object.key === metaKey)) {
    throw new Error(`Metadata file missing for ${latest.key}`);
  }

  const encBytes = Buffer.from(await s3.file(latest.key).arrayBuffer());
  const metaText = await s3.file(metaKey).text();
  const metadata = JSON.parse(metaText);

  if (metadata.encryption_algorithm !== "aes-256-gcm") {
    throw new Error(`Unsupported encryption algorithm: ${metadata.encryption_algorithm}`);
  }

  const createdAt = new Date(metadata.created_at);
  if (!Number.isFinite(createdAt.getTime())) throw new Error("Backup metadata created_at is invalid");
  const backupAgeHours = (Date.now() - createdAt.getTime()) / 3600000;
  if (backupAgeHours < 0 || backupAgeHours > MAX_BACKUP_AGE_HOURS) {
    throw new Error(`Backup age ${backupAgeHours.toFixed(2)}h exceeds ${MAX_BACKUP_AGE_HOURS}h`);
  }

  const key = Buffer.from(ENCRYPTION_KEY_HEX, "hex");
  const iv = Buffer.from(metadata.iv_hex, "hex");
  const authTag = Buffer.from(metadata.auth_tag_hex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(encBytes), decipher.final()]);

  const actualHash = sha256(plaintext);
  if (metadata.plaintext_sha256 && actualHash !== metadata.plaintext_sha256) {
    throw new Error("Backup plaintext SHA-256 mismatch");
  }
  if (metadata.plaintext_size_bytes && plaintext.length !== Number(metadata.plaintext_size_bytes)) {
    throw new Error("Backup plaintext size mismatch");
  }

  writeFileSync("/tmp/nvet-restore.dump", plaintext);

  const pgEnv = { ...process.env, PGPASSWORD: RESTORE_PGPASSWORD };
  run("pg_restore", [
    "--host", RESTORE_PGHOST,
    "--port", RESTORE_PGPORT,
    "--username", RESTORE_PGUSER,
    "--dbname", RESTORE_PGDATABASE,
    "--clean", "--if-exists", "--no-owner", "--no-acl", "--exit-on-error",
    "/tmp/nvet-restore.dump",
  ], pgEnv);

  const tableCount = Number(run("psql", [
    "--host", RESTORE_PGHOST,
    "--port", RESTORE_PGPORT,
    "--username", RESTORE_PGUSER,
    "--dbname", RESTORE_PGDATABASE,
    "--tuples-only", "--no-align",
    "--command", "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';",
  ], pgEnv));

  if (!Number.isFinite(tableCount) || tableCount <= 0) {
    throw new Error(`Restored database has invalid public table count: ${tableCount}`);
  }

  const keyTableCount = Number(run("psql", [
    "--host", RESTORE_PGHOST,
    "--port", RESTORE_PGPORT,
    "--username", RESTORE_PGUSER,
    "--dbname", RESTORE_PGDATABASE,
    "--tuples-only", "--no-align",
    "--command", "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('users','pets','appointments');",
  ], pgEnv));

  if (keyTableCount < 3) {
    throw new Error(`Restored database is missing key Nvet tables (${keyTableCount}/3 present)`);
  }

  console.log(`[VERIFY] BACKUP_ARTIFACT=${latest.key}`);
  console.log(`[VERIFY] BACKUP_CREATED_AT=${createdAt.toISOString()}`);
  console.log(`[VERIFY] BACKUP_AGE_HOURS=${backupAgeHours.toFixed(2)}`);
  console.log(`[VERIFY] PLAINTEXT_SHA256=${actualHash}`);
  console.log(`[VERIFY] PUBLIC_TABLES=${tableCount}`);
  console.log("[VERIFY] ===== RESTORE DRILL PASSED =====");
} catch (error) {
  console.error("[VERIFY] ===== RESTORE DRILL FAILED =====");
  console.error("[VERIFY] Error:", error);
  process.exitCode = 1;
} finally {
  cleanup(tmp);
}
