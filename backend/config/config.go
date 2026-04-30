package config

import "os"

type Config struct {
	CouchbaseURL      string
	CouchbaseUsername string
	CouchbasePassword string
	CouchbaseBucket   string
	JWTSecret         string
	Port              string
}

func Load() *Config {
	return &Config{
		CouchbaseURL:      getEnv("COUCHBASE_URL", "couchbase://localhost"),
		CouchbaseUsername: getEnv("COUCHBASE_USERNAME", "Administrator"),
		CouchbasePassword: getEnv("COUCHBASE_PASSWORD", "password"),
		CouchbaseBucket:   getEnv("COUCHBASE_BUCKET", "playtogether"),
		JWTSecret:         getEnv("JWT_SECRET", "playtogether-secret-change-in-production"),
		Port:              getEnv("PORT", "8080"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
