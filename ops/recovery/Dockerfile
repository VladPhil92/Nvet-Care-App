FROM postgres:18-bookworm

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
       ca-certificates \
       python3 \
       python3-pip \
  && python3 -m pip install --break-system-packages --no-cache-dir boto3 cryptography \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/nvet-recovery
COPY ops/recovery/backup.py ops/recovery/verify.py ./

# The upstream postgres image carries docker-entrypoint.sh. This service is a
# one-shot recovery worker, not a database server, so remove the inherited
# entrypoint explicitly and execute only the requested recovery command.
ENTRYPOINT []
CMD ["python3", "backup.py"]
