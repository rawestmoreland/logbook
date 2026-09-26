package eligibility

import "testing"

func TestAlreadyHeldASELPrivateNoCertificates(t *testing.T) {
	certType, held := AlreadyHeldASELPrivate(nil)
	wantBool(t, "held", held, false)
	if certType != "" {
		t.Errorf("certificateType: got %q, want \"\"", certType)
	}
}

func TestAlreadyHeldASELPrivateQualifyingTypes(t *testing.T) {
	for _, certType := range []string{"private", "commercial", "atp"} {
		_, held := AlreadyHeldASELPrivate([]HeldCertificate{
			{CertificateType: certType, CategoryClasses: []string{aselCategoryClass}},
		})
		wantBool(t, certType+" held", held, true)
	}
}

func TestAlreadyHeldASELPrivateNonQualifyingTypes(t *testing.T) {
	for _, certType := range []string{"student", "sport", "recreational", "cfi", "other"} {
		_, held := AlreadyHeldASELPrivate([]HeldCertificate{
			{CertificateType: certType, CategoryClasses: []string{aselCategoryClass}},
		})
		wantBool(t, certType+" held", held, false)
	}
}

func TestAlreadyHeldASELPrivateBlankCategoryClassesIsNotEnough(t *testing.T) {
	_, held := AlreadyHeldASELPrivate([]HeldCertificate{
		{CertificateType: "private", CategoryClasses: nil},
	})
	wantBool(t, "held", held, false)
}

func TestAlreadyHeldASELPrivateOtherCategoryClassIsNotEnough(t *testing.T) {
	_, held := AlreadyHeldASELPrivate([]HeldCertificate{
		{CertificateType: "private", CategoryClasses: []string{"rotorcraft_helicopter"}},
	})
	wantBool(t, "held", held, false)
}

func TestAlreadyHeldASELPrivateReturnsMatchingCertificateType(t *testing.T) {
	certType, held := AlreadyHeldASELPrivate([]HeldCertificate{
		{CertificateType: "student", CategoryClasses: []string{aselCategoryClass}},
		{CertificateType: "commercial", CategoryClasses: []string{aselCategoryClass}},
	})
	wantBool(t, "held", held, true)
	if certType != "commercial" {
		t.Errorf("certificateType: got %q, want %q", certType, "commercial")
	}
}

func TestAlreadyHeldASELCommercialNoCertificates(t *testing.T) {
	certType, held := AlreadyHeldASELCommercial(nil)
	wantBool(t, "held", held, false)
	if certType != "" {
		t.Errorf("certificateType: got %q, want \"\"", certType)
	}
}

func TestAlreadyHeldASELCommercialQualifyingTypes(t *testing.T) {
	for _, certType := range []string{"commercial", "atp"} {
		_, held := AlreadyHeldASELCommercial([]HeldCertificate{
			{CertificateType: certType, CategoryClasses: []string{aselCategoryClass}},
		})
		wantBool(t, certType+" held", held, true)
	}
}

func TestAlreadyHeldASELCommercialNonQualifyingTypes(t *testing.T) {
	// "private" deliberately doesn't qualify: holding private doesn't
	// evidence having also earned commercial privileges.
	for _, certType := range []string{"private", "student", "sport", "recreational", "cfi", "other"} {
		_, held := AlreadyHeldASELCommercial([]HeldCertificate{
			{CertificateType: certType, CategoryClasses: []string{aselCategoryClass}},
		})
		wantBool(t, certType+" held", held, false)
	}
}

func TestAlreadyHeldASELCommercialBlankCategoryClassesIsNotEnough(t *testing.T) {
	_, held := AlreadyHeldASELCommercial([]HeldCertificate{
		{CertificateType: "commercial", CategoryClasses: nil},
	})
	wantBool(t, "held", held, false)
}

func TestAlreadyHeldASELCommercialOtherCategoryClassIsNotEnough(t *testing.T) {
	_, held := AlreadyHeldASELCommercial([]HeldCertificate{
		{CertificateType: "commercial", CategoryClasses: []string{"rotorcraft_helicopter"}},
	})
	wantBool(t, "held", held, false)
}

func TestAlreadyHeldASELCommercialReturnsMatchingCertificateType(t *testing.T) {
	certType, held := AlreadyHeldASELCommercial([]HeldCertificate{
		{CertificateType: "private", CategoryClasses: []string{aselCategoryClass}},
		{CertificateType: "atp", CategoryClasses: []string{aselCategoryClass}},
	})
	wantBool(t, "held", held, true)
	if certType != "atp" {
		t.Errorf("certificateType: got %q, want %q", certType, "atp")
	}
}
