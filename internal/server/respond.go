package server

import (
	"encoding/json"
	"log"
	"net/http"
)

func respondJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("respond: encode error: %v", err)
	}
}

type apiError struct {
	Error string `json:"error"`
}

func respondError(w http.ResponseWriter, status int, msg string) {
	respondJSON(w, status, apiError{Error: msg})
}

// respondInternal logs the underlying error with context and returns a generic
// 500 to the client, so SQLite / filesystem internals never leak to callers.
func respondInternal(w http.ResponseWriter, context string, err error) {
	log.Printf("%s: %v", context, err)
	respondError(w, http.StatusInternalServerError, "internal error")
}
