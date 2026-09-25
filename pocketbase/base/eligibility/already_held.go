package eligibility

// certificateTypesAtOrAboveASELPrivate is the set of pilot_certificates
// certificate_type values that presuppose airplane-category/ASEL-or-broader
// privileges at or above private pilot level. Sport/recreational/student
// (and every non-airplane-implying type) deliberately aren't included here —
// see AlreadyHeldASELPrivate's doc comment for why.
var certificateTypesAtOrAboveASELPrivate = map[string]bool{
	"private":    true,
	"commercial": true,
	"atp":        true,
}

// HeldCertificate is the minimal evidence api/eligibility.go extracts from a
// pilot_certificates record — just enough for AlreadyHeldASELPrivate to
// decide, without this package depending on core.Record.
type HeldCertificate struct {
	CertificateType string
	CategoryClasses []string
}

// AlreadyHeldASELPrivate reports whether certs contains unambiguous evidence
// the pilot already holds private-pilot-or-higher airplane single-engine
// land (ASEL) privileges — i.e. whether PrivatePilotAirplaneEligibility's
// 61.109(a) checklist is something they've already earned rather than an
// outstanding requirement.
//
// Same fail-safe posture as this package's own doc comment and currency's:
// only an unambiguous match counts. A row's certificate_type must be
// "private", "commercial", or "atp" (all three presuppose airplane category
// privileges at or above private pilot level; sport/recreational/student do
// not), AND its category_classes must explicitly list
// aselCategoryClass — a "private" row with category_classes left blank is
// not enough evidence to assume it covers ASEL. Callers are expected to have
// already filtered out deleted rows.
//
// Returns the matching row's certificate_type (the first qualifying match)
// for UI copy; ("", false) when nothing in certs qualifies.
func AlreadyHeldASELPrivate(certs []HeldCertificate) (certificateType string, held bool) {
	for _, c := range certs {
		if !certificateTypesAtOrAboveASELPrivate[c.CertificateType] {
			continue
		}
		for _, categoryClass := range c.CategoryClasses {
			if categoryClass == aselCategoryClass {
				return c.CertificateType, true
			}
		}
	}
	return "", false
}
