package config

import "os"

type Config struct {
	PostgresHost     string
	PostgresPort     string
	PostgresUser     string
	PostgresPassword string
	PostgresDB       string
	JWTSecret        string
	Port             string
}

func Load() *Config {
	return &Config{
		PostgresHost:     getEnv("POSTGRES_HOST", "localhost"),
		PostgresPort:     getEnv("POSTGRES_PORT", "5432"),
		PostgresUser:     getEnv("POSTGRES_USER", "playtogether"),
		PostgresPassword: getEnv("POSTGRES_PASSWORD", "playtogether"),
		PostgresDB:       getEnv("POSTGRES_DB", "playtogether"),
		JWTSecret:        getEnv("JWT_SECRET", "playtogether-secret-change-in-production"),
		Port:             getEnv("PORT", "8080"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
