#!/bin/bash
set -e

CB_HOST=${CB_HOST:-localhost}
CB_USER=${CB_USER:-Administrator}
CB_PASS=${CB_PASS:-password123}
BUCKET=${BUCKET:-playtogether}

echo "==> Stopping and removing old container + volume..."
docker stop playtogether-couchbase 2>/dev/null || true
docker rm   playtogether-couchbase 2>/dev/null || true
docker volume rm playtogether_couchbase_data 2>/dev/null || true

echo "==> Starting fresh Couchbase container..."
docker run -d \
  --name playtogether-couchbase \
  -p 8091-8096:8091-8096 \
  -p 11210:11210 \
  couchbase:community-7.2.0

echo "==> Waiting for REST API..."
until curl -sf "http://$CB_HOST:8091/pools" >/dev/null 2>&1; do
  printf "."; sleep 2
done
echo " up"
sleep 2

echo "==> Step 0: Rename node to 127.0.0.1 (critical — fixes SDK host resolution)..."
curl -s -X POST "http://$CB_HOST:8091/node/controller/rename" \
  -d "hostname=127.0.0.1"
echo ""

echo "==> Step 1: Enable kv + n1ql + index services..."
curl -s -X POST "http://$CB_HOST:8091/node/controller/setupServices" \
  -d "services=kv%2Cn1ql%2Cindex"
echo ""

echo "==> Step 2: Set admin credentials..."
curl -s -X POST "http://$CB_HOST:8091/settings/web" \
  -d "username=$CB_USER&password=$CB_PASS&port=SAME"
echo ""

echo "==> Step 3: Set memory quotas..."
curl -s -u "$CB_USER:$CB_PASS" \
  -X POST "http://$CB_HOST:8091/pools/default" \
  -d "memoryQuota=512&indexMemoryQuota=256"
echo ""
sleep 2

echo "==> Step 4: Create bucket '$BUCKET'..."
curl -s -u "$CB_USER:$CB_PASS" \
  -X POST "http://$CB_HOST:8091/pools/default/buckets" \
  -d "name=$BUCKET&bucketType=couchbase&ramQuotaMB=256&flushEnabled=1"
echo ""

echo "==> Waiting 15s for bucket + services to stabilise..."
sleep 15

echo "==> Step 5: Set external alternate address to 127.0.0.1 (fixes SDK host resolution from host machine)..."
curl -s -u "$CB_USER:$CB_PASS" \
  -X PUT "http://$CB_HOST:8091/node/controller/setupAlternateAddresses/external" \
  -d "hostname=127.0.0.1"
echo ""

echo "==> Verifying node hostname and services..."
curl -s -u "$CB_USER:$CB_PASS" "http://$CB_HOST:8091/pools/nodes" \
  | python3 -c "
import json,sys
d=json.load(sys.stdin)
for n in d.get('nodes',[]):
    print('  hostname:', n.get('hostname'))
    print('  services:', n.get('services'))
    print('  status  :', n.get('status'))
"

echo ""
echo "====================================="
echo "Couchbase ready!"
echo "  Admin UI : http://localhost:8091"
echo "  User     : $CB_USER / $CB_PASS"
echo "  Bucket   : $BUCKET"
echo "====================================="
