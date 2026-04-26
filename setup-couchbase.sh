#!/bin/bash
# Run this after Couchbase starts to initialize the cluster and bucket

COUCHBASE_HOST=${COUCHBASE_HOST:-localhost}
ADMIN_USER=${ADMIN_USER:-Administrator}
ADMIN_PASS=${ADMIN_PASS:-password123}
BUCKET_NAME=${BUCKET_NAME:-playtogether}

echo "Waiting for Couchbase to be ready..."
until curl -sf http://$COUCHBASE_HOST:8091/ui/index.html > /dev/null; do
  sleep 2
done

echo "Initializing Couchbase cluster..."
curl -s -X POST http://$COUCHBASE_HOST:8091/clusterInit \
  -d "hostname=127.0.0.1&services=kv,n1ql,index&memoryQuota=512&indexMemoryQuota=256" \
  > /dev/null

echo "Setting up admin credentials..."
curl -s -X POST http://$COUCHBASE_HOST:8091/settings/web \
  -d "password=$ADMIN_PASS&username=$ADMIN_USER&port=SAME" \
  > /dev/null

sleep 3

echo "Creating bucket '$BUCKET_NAME'..."
curl -s -u $ADMIN_USER:$ADMIN_PASS \
  -X POST http://$COUCHBASE_HOST:8091/pools/default/buckets \
  -d "name=$BUCKET_NAME&bucketType=couchbase&ramQuotaMB=256&flushEnabled=1" \
  > /dev/null

echo ""
echo "Couchbase setup complete!"
echo "  Admin UI: http://$COUCHBASE_HOST:8091"
echo "  Username: $ADMIN_USER"
echo "  Password: $ADMIN_PASS"
echo "  Bucket:   $BUCKET_NAME"
