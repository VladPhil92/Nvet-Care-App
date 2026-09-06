import os
import subprocess
import hashlib
import json
import boto3
from botocore.config import Config
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def env(name: str, default=None) -> str:
    value = os.environ.get(name, default)
    if value is None or value == "":
        raise RuntimeError(f"{name} is required")
    return value


BUCKET = env("BUCKET")
ENDPOINT = env("ENDPOINT")
REGION = env("REGION")
ACCESS_KEY_ID = env("ACCESS_KEY_ID")
SECRET_ACCESS_KEY = env("SECRET_ACCESS_KEY")
BACKUP_ENCRYPTION_KEY = env("BACKUP_ENCRYPTION_KEY")

SOURCE_PGHOST = env("SOURCE_PGHOST")
SOURCE_PGPORT = env("SOURCE_PGPORT", "5432")
SOURCE_PGUSER = env("SOURCE_PGUSER")
SOURCE_PGPASSWORD = env("SOURCE_PGPASSWORD")
SOURCE_PGDATABASE = env("SOURCE_PGDATABASE")

RESTORE_PGHOST = env("RESTORE_PGHOST")
RESTORE_PGPORT = env("RESTORE_PGPORT", "5432")
RESTORE_PGUSER = env("RESTORE_PGUSER")
RESTORE_PGPASSWORD = env("RESTORE_PGPASSWORD")
RESTORE_PGDATABASE = env("RESTORE_PGDATABASE")

key = bytes.fromhex(BACKUP_ENCRYPTION_KEY)
if len(key) != 32:
    raise RuntimeError("BACKUP_ENCRYPTION_KEY must be a 32-byte hex string")

s3 = boto3.client(
    "s3",
    endpoint_url=ENDPOINT,
    region_name=REGION,
    aws_access_key_id=ACCESS_KEY_ID,
    aws_secret_access_key=SECRET_ACCESS_KEY,
    config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
)

listed = s3.list_objects_v2(Bucket=BUCKET, Prefix="nvet_postgres_backup_")
metadata_objects = [
    item for item in listed.get("Contents", []) if item["Key"].endswith(".meta.json")
]
if not metadata_objects:
    raise RuntimeError("no .meta.json backup objects found via signed S3")

latest_metadata_object = max(metadata_objects, key=lambda item: item["LastModified"])
metadata_key = latest_metadata_object["Key"]
metadata = json.loads(
    s3.get_object(Bucket=BUCKET, Key=metadata_key)["Body"].read()
)

object_key = metadata["object_key"]
encrypted = s3.get_object(Bucket=BUCKET, Key=object_key)["Body"].read()
if not encrypted:
    raise RuntimeError("encrypted backup object is empty")

nonce = bytes.fromhex(metadata["iv_hex"])
auth_tag = bytes.fromhex(metadata["auth_tag_hex"])
plaintext = AESGCM(key).decrypt(nonce, encrypted + auth_tag, None)

plaintext_sha256 = hashlib.sha256(plaintext).hexdigest()
if plaintext_sha256 != metadata["plaintext_sha256"]:
    raise RuntimeError("plaintext SHA-256 mismatch after decrypt")
if len(plaintext) != int(metadata["plaintext_size_bytes"]):
    raise RuntimeError("plaintext size mismatch after decrypt")

dump_path = "/tmp/nvet-restore.dump"
with open(dump_path, "wb") as fh:
    fh.write(plaintext)

pg_restore_version = subprocess.run(
    ["pg_restore", "--version"],
    check=True,
    text=True,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
).stdout.strip()
if " 18." not in pg_restore_version and not pg_restore_version.endswith(" 18"):
    raise RuntimeError(
        f"pg_restore is not PostgreSQL 18 compatible: {pg_restore_version}"
    )


def pg_env(password: str):
    result = os.environ.copy()
    result["PGPASSWORD"] = password
    return result


def psql(host, port, user, password, database, sql):
    return subprocess.run(
        ["psql", "-h", host, "-p", port, "-U", user, "-d", database, "-Atc", sql],
        env=pg_env(password),
        check=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    ).stdout.strip()


source_server_version = psql(
    SOURCE_PGHOST, SOURCE_PGPORT, SOURCE_PGUSER, SOURCE_PGPASSWORD, SOURCE_PGDATABASE,
    "SHOW server_version;",
)
restore_server_version = psql(
    RESTORE_PGHOST, RESTORE_PGPORT, RESTORE_PGUSER, RESTORE_PGPASSWORD, RESTORE_PGDATABASE,
    "SHOW server_version;",
)

psql(
    RESTORE_PGHOST,
    RESTORE_PGPORT,
    RESTORE_PGUSER,
    RESTORE_PGPASSWORD,
    RESTORE_PGDATABASE,
    "DROP SCHEMA public CASCADE; CREATE SCHEMA public;",
)

subprocess.run(
    [
        "pg_restore",
        "-h", RESTORE_PGHOST,
        "-p", RESTORE_PGPORT,
        "-U", RESTORE_PGUSER,
        "-d", RESTORE_PGDATABASE,
        "--no-owner",
        "--no-acl",
        "--exit-on-error",
        dump_path,
    ],
    env=pg_env(RESTORE_PGPASSWORD),
    check=True,
)


def count_table(host, port, user, password, database, table):
    exists = psql(
        host,
        port,
        user,
        password,
        database,
        f"SELECT to_regclass('public.{table}') IS NOT NULL;",
    )
    if exists != "t":
        return None
    return int(
        psql(
            host,
            port,
            user,
            password,
            database,
            f'SELECT count(*) FROM public."{table}";',
        )
    )


tables = ["users", "pets", "appointments", "_prisma_migrations", "_nvet_manual_migrations"]
restored_counts = {
    table: count_table(
        RESTORE_PGHOST,
        RESTORE_PGPORT,
        RESTORE_PGUSER,
        RESTORE_PGPASSWORD,
        RESTORE_PGDATABASE,
        table,
    )
    for table in tables
}
source_counts = {
    table: count_table(
        SOURCE_PGHOST,
        SOURCE_PGPORT,
        SOURCE_PGUSER,
        SOURCE_PGPASSWORD,
        SOURCE_PGDATABASE,
        table,
    )
    for table in tables
}
backup_counts = metadata.get("source_aggregate_counts")
if not isinstance(backup_counts, dict):
    raise RuntimeError("backup metadata is missing source_aggregate_counts")

# Restore certification is anchored to the immutable aggregates captured when
# the dump was created. Production may legitimately receive writes between the
# backup and the isolated restore drill; current-source drift is therefore
# evidence to report, not a reason to reject an otherwise exact restoration.
if restored_counts != backup_counts:
    raise RuntimeError(
        f"restored aggregates differ from backup-time aggregates: "
        f"restored={restored_counts} backup={backup_counts}"
    )
source_drift_detected = source_counts != backup_counts

print("[VERIFY] RECOVERY CERTIFIED — LOGICAL/OFFSITE")
print(f"[VERIFY] object={object_key}")
print(f"[VERIFY] created_at={metadata['created_at']}")
print(
    f"[VERIFY] encrypted_size_bytes={len(encrypted)} "
    f"plaintext_size_bytes={len(plaintext)}"
)
print(f"[VERIFY] plaintext_sha256_prefix={plaintext_sha256[:16]}")
print(f"[VERIFY] backup_restore_aggregate_equality={json.dumps(restored_counts, sort_keys=True)}")
print(f"[VERIFY] current_source_counts={json.dumps(source_counts, sort_keys=True)}")
print(f"[VERIFY] source_drift_since_backup={str(source_drift_detected).lower()}")
print(f"[VERIFY] pg_restore_version={pg_restore_version}")
print(f"[VERIFY] source_server_version={source_server_version}")
print(f"[VERIFY] restore_server_version={restore_server_version}")
