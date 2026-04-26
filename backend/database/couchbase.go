package database

import (
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/couchbase/gocb/v2"
	"github.com/playtogether/backend/config"
)

var (
	Cluster    *gocb.Cluster
	Bucket     *gocb.Bucket
	Collection *gocb.Collection
)

func Connect(cfg *config.Config) error {
	var err error

	Cluster, err = gocb.Connect(cfg.CouchbaseURL, gocb.ClusterOptions{
		Authenticator: gocb.PasswordAuthenticator{
			Username: cfg.CouchbaseUsername,
			Password: cfg.CouchbasePassword,
		},
		TimeoutsConfig: gocb.TimeoutsConfig{
			ConnectTimeout: 20 * time.Second,
			KVTimeout:      10 * time.Second,
			QueryTimeout:   30 * time.Second,
		},
	})
	if err != nil {
		return fmt.Errorf("failed to connect to Couchbase: %w", err)
	}

	Bucket = Cluster.Bucket(cfg.CouchbaseBucket)
	Collection = Bucket.DefaultCollection()

	if err := probeKV(Collection, 20*time.Second); err != nil {
		return fmt.Errorf("bucket not reachable: %w", err)
	}

	log.Println("Connected to Couchbase")

	// Ensure indexer storage mode is set before creating indexes.
	ensureIndexStorageMode(cfg.CouchbaseUsername, cfg.CouchbasePassword)

	time.Sleep(2 * time.Second)
	createIndexes(cfg.CouchbaseBucket)

	return nil
}

// ensureIndexStorageMode sets storageMode=forestdb if it is not already configured.
// This is required on Couchbase Community Edition before any GSI index can be created.
func ensureIndexStorageMode(username, password string) {
	endpoint := "http://localhost:8091/settings/indexes"
	data := url.Values{"storageMode": {"forestdb"}}

	req, err := http.NewRequest("POST", endpoint, strings.NewReader(data.Encode()))
	if err != nil {
		log.Printf("index storage mode: could not build request: %v", err)
		return
	}
	req.SetBasicAuth(username, password)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("index storage mode: request failed: %v", err)
		return
	}
	defer resp.Body.Close()
	log.Printf("index storage mode set (status %d)", resp.StatusCode)
}

// probeKV retries a KV get until it gets "key not found" (success) or times out.
func probeKV(col *gocb.Collection, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	var lastErr error
	for time.Now().Before(deadline) {
		_, err := col.Get("__probe__", nil)
		if err == nil || errors.Is(err, gocb.ErrDocumentNotFound) {
			return nil
		}
		lastErr = err
		time.Sleep(500 * time.Millisecond)
	}
	return lastErr
}

func createIndexes(bucketName string) {
	// DROP syntax is used as a workaround because Couchbase Community 7.x does not
	// support CREATE INDEX IF NOT EXISTS. We ignore errors on DROP (index may not exist).
	indexes := []struct{ name, stmt string }{
		{"#primary", fmt.Sprintf("CREATE PRIMARY INDEX ON `%s`", bucketName)},
		{"idx_type", fmt.Sprintf("CREATE INDEX idx_type ON `%s`(`type`)", bucketName)},
		{"idx_event_type", fmt.Sprintf("CREATE INDEX idx_event_type ON `%s`(event_id, `type`)", bucketName)},
		{"idx_game_type", fmt.Sprintf("CREATE INDEX idx_game_type ON `%s`(game_id, `type`)", bucketName)},
	}

	for _, idx := range indexes {
		if _, err := Cluster.Query(idx.stmt, nil); err != nil {
			// "already exists" is fine — anything else log it
			msg := err.Error()
			if !strings.Contains(msg, "already exist") && !strings.Contains(msg, "Index already exist") {
				log.Printf("index %q: %v", idx.name, err)
			}
		} else {
			log.Printf("index %q created", idx.name)
		}
	}
	log.Println("Indexes ready")
}

func Close() {
	if Cluster != nil {
		Cluster.Close(nil)
	}
}
