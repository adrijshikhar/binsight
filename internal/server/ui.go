package server

import (
	"embed"
	"io/fs"
	"net/http"
)

//go:embed all:dist
var uiFS embed.FS

// uiHandler serves the built frontend from the embedded dist directory.
func uiHandler() http.Handler {
	sub, err := fs.Sub(uiFS, "dist")
	if err != nil {
		panic(err)
	}
	return http.FileServer(http.FS(sub))
}
