#!/bin/bash
export COUCHBASE_URL="couchbase://localhost?network=external"
export COUCHBASE_USERNAME="Administrator"
export COUCHBASE_PASSWORD="password123"
export COUCHBASE_BUCKET="playtogether"
export JWT_SECRET="playtogether-dev-secret"
export PORT="8080"

exec go run .
