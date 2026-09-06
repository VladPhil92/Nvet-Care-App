import os
import subprocess
import hashlib
import json
import datetime
import boto3
from botocore.config import Config
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


PGHOST = env("PGHOST")
PGPORT = env("PGPORT")
PGUSER = env("PGUSER")
PGPASSWORD = env("PGPASSWORD")
PGDATABASE = env("PGDATABASE")
BUCKET = env("BUCKET")
ENDPOINT = env("ENDPOINT")
REGION = env("REGION")
ACCESS_KEY_ID = env("ACCESS_KEY_ID")
SECRET_ACCESS_KEY = env("SECRET_ACCESS_KEY")
BACKUP_ENCRYPTION_KEY = env("BACKUP_ENCRYPTION_KEY")
RETENTION_DAYS = int(os.environ.get("RETENTION_DAYS", "7"))

if RETENTION_DAYS < 7:
    raise RuntimeError("RETENTION_DAYS must be >= 7")

key = bytes.fromhex(BACKUP_ENCRYPTION_KEY)
if len(key) != 32:
    raise RuntimeError("BACKUP_ENCRYPTION_KEY must be a 32-byte hex string")

pg_env = os.environ.copy()
pg_env["PGPASSWORD"] = PGPASSWORD


def run(cmd: list[str]) -> str:
    result = subprocess.run(
        cmd,
        env=pg_env,
        check=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return result.stdout.strip()


pg_dump_version = run(["pg_dump", "--version"])
server_version = run(
    ["psql", "-h", PGHOST, "-p", PGPORT, "-U", PGUSER, "-d", PGDATABASE, "-Atc", "SHOW server_version;"]
)
if " 18." not in pg_dump_version and not pg_dump_version.endswith(" 18"):
    raise RuntimeError(f"pg_dump is not PostgreSQL 18 compatible: {pg_dump_version}")


def count_table(table: str):
    exists = run(
        [
            "psql", "-h", PGHOST, "-p", PGPORT, "-U", PGUSER, "-d", PGDATABASE, "-Atc",
            f"SELECT to_regclass('public.{table}') IS NOT NULL;",
        ]
    )
    if exists != "t":
        return None
    return int(
        run(
            [
                "psql", "-h", PGHOST, "-p", PGPORT, "-U", PGUSER, "-d", PGDATABASE, "-Atc",
                f'SELECT count(*) FROM public."{table}";',
            ]
        )
    )


tables = ["users", "pets", "appointments", "_prisma_migrations", "_nvet_manual_migrations"]
counts = {table: count_table(table) for table in tables}

timestamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
base_name = f"nvet_postgres_backup_{timestamp}"
dump_path = f"/tmp/{base_name}.dump"

subprocess.run(
    [
        "pg_dump",
        "-h", PGHOST,
        "-p", PGPORT,
        "-U", PGUSER,
        "-d", PGDATABASE,
        "-Fc",
        "--no-owner",
        "--no-acl",
        "-f", dump_path,
    ],
    env=pg_env,
    check=True,
)

with open(dump_path, "rb") as fh:
    plaintext = fh.read()

if not plaintext:
    raise RuntimeError("pg_dump produced an empty archive")

plaintext_sha256 = hashlib.sha256(plaintext).hexdigest()
nonce = os.urandom(12)
ciphertext_and_tag = AESGCM(key).encrypt(nonce, plaintext, None)
ciphertext = ciphertext_and_tag[:-16]
auth_tag = ciphertext_and_tag[-16:]

object_key = f"{base_name}.enc"
metadata_key = f"{base_name}.meta.json"

metadata = {
    "schema_version": 1,
    "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "object_key": object_key,
    "metadata_key": metadata_key,
    "plaintext_sha256": plaintext_sha256,
    "plaintext_size_bytes": len(plaintext),
    "encrypted_size_bytes": len(ciphertext),
    "encryption_algorithm": "aes-256-gcm",
    "iv_hex": nonce.hex(),
    "auth_tag_hex": auth_tag.hex(),
    "retention_days": RETENTION_DAYS,
    "pg_dump_version": pg_dump_version,
    "postgres_server_version": server_version,
    "source_aggregate_counts": counts,
}

s3 = boto3.client(
    "s3",
    endpoint_url=ENDPOINT,
    region_name=REGION,
    aws_access_key_id=ACCESS_KEY_ID,
    aws_secret_access_key=SECRET_ACCESS_KEY,
    config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
)

s3.put_object(
    Bucket=BUCKET,
    Key=object_key,
    Body=ciphertext,
    ContentType="application/octet-stream",
)
metadata_bytes = (json.dumps(metadata, sort_keys=True, separators=(",", ":")) + "\n").encode()
s3.put_object(
    Bucket=BUCKET,
    Key=metadata_key,
    Body=metadata_bytes,
    ContentType="application/json",
)

object_head = s3.head_object(Bucket=BUCKET, Key=object_key)
metadata_head = s3.head_object(Bucket=BUCKET, Key=metadata_key)
if object_head["ContentLength"] <= 0 or metadata_head["ContentLength"] <= 0:
    raise RuntimeError("uploaded backup evidence is empty")

cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=RETENTION_DAYS)
listed = s3.list_objects_v2(Bucket=BUCKET, Prefix="nvet_postgres_backup_")
for item in listed.get("Contents", []):
    if item["LastModified"] < cutoff and (
        item["Key"].endswith(".enc") or item["Key"].endswith(".meta.json")
    ):
        s3.delete_object(Bucket=BUCKET, Key=item["Key"])

os.remove(dump_path)

print(f"[BACKUP] CERTIFIED_WRITE object={object_key}")
print(f"[BACKUP] created_at={metadata['created_at']}")
print(
    f"[BACKUP] plaintext_size_bytes={len(plaintext)} "
    f"encrypted_size_bytes={len(ciphertext)}"
)
print(f"[BACKUP] plaintext_sha256_prefix={plaintext_sha256[:16]}")
print(f"[BACKUP] retention_days={RETENTION_DAYS}")
print(f"[BACKUP] pg_dump_version={pg_dump_version}")
print(f"[BACKUP] postgres_server_version={server_version}")
print(f"[BACKUP] source_counts={json.dumps(counts, sort_keys=True)}")
