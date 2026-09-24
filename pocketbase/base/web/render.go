package web

import (
	"bytes"
	"embed"
	"html/template"
	"io"
	"net/http"

	"github.com/pocketbase/pocketbase/tools/types"
)

//go:embed templates/*.html templates/partials/*.html templates/pages/*.html
var templateFS embed.FS

var funcMap = template.FuncMap{
	"formatDate": func(dt types.DateTime) string {
		return dt.Time().Format("Jan 2, 2006")
	},
}

var tmpl = template.Must(
	template.New("").Funcs(funcMap).ParseFS(templateFS,
		"templates/*.html", "templates/partials/*.html", "templates/pages/*.html"),
)

func renderPage(w io.Writer, page string, data any) error {
	return renderWithLayout(w, "layout", page, data)
}

// renderAuthPage renders a page with the minimal, sidenav-free layout used
// for the signed-out auth flow (login, signup, verify-pending).
func renderAuthPage(w io.Writer, page string, data any) error {
	return renderWithLayout(w, "auth-layout", page, data)
}

func renderWithLayout(w io.Writer, layout, page string, data any) error {
	if rw, ok := w.(http.ResponseWriter); ok {
		rw.Header().Set("Content-Type", "text/html; charset=utf-8")
	}
	var buf bytes.Buffer
	if err := tmpl.ExecuteTemplate(&buf, page+"-content", data); err != nil {
		return err
	}
	return tmpl.ExecuteTemplate(w, layout, map[string]any{
		"Content": template.HTML(buf.String()),
		"Data":    data,
	})
}

func renderFragment(w io.Writer, name string, data any) error {
	if rw, ok := w.(http.ResponseWriter); ok {
		rw.Header().Set("Content-Type", "text/html; charset=utf-8")
	}
	return tmpl.ExecuteTemplate(w, name, data)
}
