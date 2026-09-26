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

// certificateTypesAtOrAboveASELCommercial is the analogous set for
// AlreadyHeldASELCommercial — deliberately excludes "private": holding a
// private pilot certificate doesn't evidence having also earned commercial
// privileges, unlike certificateTypesAtOrAboveASELPrivate where "commercial"
// and "atp" both presuppose private-or-higher privileges.
var certificateTypesAtOrAboveASELCommercial = map[string]bool{
	"commercial": true,
	"atp":        true,
}

// HeldCertificate is the minimal evidence api/eligibility.go extracts from a
// pilot_certificates record — just enough for AlreadyHeldASELPrivate and
// AlreadyHeldASELCommercial to decide, without this package depending on
// core.Record.
type HeldCertificate struct {
	CertificateType string
	CategoryClasses []string
}

// alreadyHeldASEL is the evidence check both AlreadyHeldASELPrivate and
// AlreadyHeldASELCommercial apply, parameterized by which certificate_type
// values presuppose the privilege in question. Same fail-safe posture as
// this package's own doc comment and currency's: only an unambiguous
// match counts — a qualifying certificate_type row whose category_classes
// doesn't explicitly list aselCategoryClass is not enough evidence.
// Callers are expected to have already filtered out deleted rows.
//
// Returns the matching row's certificate_type (the first qualifying match)
// for UI copy; ("", false) when nothing in certs qualifies.
func alreadyHeldASEL(certs []HeldCertificate, qualifyingTypes map[string]bool) (certificateType string, held bool) {
	for _, c := range certs {
		if !qualifyingTypes[c.CertificateType] {
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

// AlreadyHeldASELPrivate reports whether certs contains unambiguous evidence
// the pilot already holds private-pilot-or-higher airplane single-engine
// land (ASEL) privileges — i.e. whether PrivatePilotAirplaneEligibility's
// 61.109(a) checklist is something they've already earned rather than an
// outstanding requirement. A row's certificate_type must be "private",
// "commercial", or "atp" (all three presuppose airplane category privileges
// at or above private pilot level; sport/recreational/student do not) — see
// alreadyHeldASEL for the category_classes check applied on top of that.
func AlreadyHeldASELPrivate(certs []HeldCertificate) (certificateType string, held bool) {
	return alreadyHeldASEL(certs, certificateTypesAtOrAboveASELPrivate)
}

// AlreadyHeldASELCommercial reports whether certs contains unambiguous
// evidence the pilot already holds commercial-pilot-or-higher ASEL
// privileges — i.e. whether CommercialAirplaneEligibility's 61.129(a)
// checklist is something they've already earned rather than an outstanding
// requirement. Unlike AlreadyHeldASELPrivate, a "private" row is not
// qualifying evidence here: see certificateTypesAtOrAboveASELCommercial for
// why.
func AlreadyHeldASELCommercial(certs []HeldCertificate) (certificateType string, held bool) {
	return alreadyHeldASEL(certs, certificateTypesAtOrAboveASELCommercial)
}
