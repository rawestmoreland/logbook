package migrations

import (
	"encoding/json/v2"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// pilot_certificates is purely informational reference data (issue: "let
// pilots record the certificates/ratings they hold") — a pilot's own record
// of the airman certificates and ratings they've earned (Private/Commercial/
// ATP, CFI/CFII/MEI, category/class ratings, type ratings, etc.), separate
// from and not consumed by pilots.is_instructor/cfi_certificate_number (which
// exists solely to sign endorsements — see endorsement-signatures.ts) or by
// currency/eligibility computations. Modeled as its own join-collection
// mirroring pilot_aircraft's pattern (see 1789396433_created_pilot_aircraft.go)
// rather than the dead pilots.licenses JSON column, which this does not
// repurpose.
func init() {
	m.Register(func(app core.App) error {
		jsonData := `{
			"createRule": "@request.auth.id != \"\" && pilot.user = @request.auth.id",
			"deleteRule": "@request.auth.id != \"\" && pilot.user = @request.auth.id",
			"fields": [
				{
					"autogeneratePattern": "[a-z0-9]{15}",
					"help": "",
					"hidden": false,
					"id": "text3208210256",
					"max": 15,
					"min": 15,
					"name": "id",
					"pattern": "^[a-z0-9]+$",
					"presentable": false,
					"primaryKey": true,
					"required": true,
					"system": true,
					"type": "text"
				},
				{
					"cascadeDelete": true,
					"collectionId": "pbc_2851445954",
					"help": "",
					"hidden": false,
					"id": "relation4711928365",
					"maxSelect": 1,
					"minSelect": 0,
					"name": "pilot",
					"presentable": false,
					"required": true,
					"system": false,
					"type": "relation"
				},
				{
					"help": "",
					"hidden": false,
					"id": "select6183947052",
					"maxSelect": 1,
					"name": "certificate_type",
					"presentable": false,
					"required": true,
					"system": false,
					"type": "select",
					"values": [
						"student",
						"sport",
						"recreational",
						"private",
						"commercial",
						"atp",
						"cfi",
						"cfii",
						"mei",
						"ground_instructor",
						"remote_pilot",
						"other"
					]
				},
				{
					"help": "",
					"hidden": false,
					"id": "select2957461038",
					"maxSelect": 14,
					"name": "category_classes",
					"presentable": false,
					"required": false,
					"system": false,
					"type": "select",
					"values": [
						"airplane_single_engine_land",
						"airplane_multi_engine_land",
						"airplane_single_engine_sea",
						"airplane_multi_engine_sea",
						"rotorcraft_helicopter",
						"rotorcraft_gyroplane",
						"glider",
						"lighter_than_air_airship",
						"lighter_than_air_balloon",
						"powered_lift",
						"powered_parachute_land",
						"powered_parachute_sea",
						"weight_shift_control_land",
						"weight_shift_control_sea"
					]
				},
				{
					"autogeneratePattern": "",
					"help": "Instrument rating, type ratings (e.g. \"CE-500\"), or anything category_classes' closed enum doesn't cover.",
					"hidden": false,
					"id": "text8172635940",
					"max": 0,
					"min": 0,
					"name": "additional_ratings",
					"pattern": "",
					"presentable": false,
					"primaryKey": false,
					"required": false,
					"system": false,
					"type": "text"
				},
				{
					"autogeneratePattern": "",
					"help": "",
					"hidden": false,
					"id": "text4059283716",
					"max": 0,
					"min": 0,
					"name": "certificate_number",
					"pattern": "",
					"presentable": false,
					"primaryKey": false,
					"required": false,
					"system": false,
					"type": "text"
				},
				{
					"help": "",
					"hidden": false,
					"id": "date7396182450",
					"max": "",
					"min": "",
					"name": "issue_date",
					"presentable": false,
					"required": false,
					"system": false,
					"type": "date"
				},
				{
					"autogeneratePattern": "",
					"help": "Freeform limitations printed on the certificate.",
					"hidden": false,
					"id": "text1847293650",
					"max": 0,
					"min": 0,
					"name": "limitations",
					"pattern": "",
					"presentable": false,
					"primaryKey": false,
					"required": false,
					"system": false,
					"type": "text"
				},
				{
					"help": "",
					"hidden": false,
					"id": "bool5620931847",
					"name": "deleted",
					"presentable": false,
					"required": false,
					"system": false,
					"type": "bool"
				},
				{
					"hidden": false,
					"id": "autodate2990389176",
					"name": "created",
					"onCreate": true,
					"onUpdate": false,
					"presentable": false,
					"system": false,
					"type": "autodate"
				},
				{
					"hidden": false,
					"id": "autodate3332085495",
					"name": "updated",
					"onCreate": true,
					"onUpdate": true,
					"presentable": false,
					"system": false,
					"type": "autodate"
				}
			],
			"id": "pbc_5023841796",
			"indexes": [],
			"listRule": "@request.auth.id != \"\" && pilot.user = @request.auth.id",
			"name": "pilot_certificates",
			"system": false,
			"type": "base",
			"updateRule": "@request.auth.id != \"\" && pilot.user = @request.auth.id",
			"viewRule": "@request.auth.id != \"\" && pilot.user = @request.auth.id"
		}`

		collection := &core.Collection{}
		if err := json.Unmarshal([]byte(jsonData), &collection); err != nil {
			return err
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pbc_5023841796")
		if err != nil {
			return err
		}

		return app.Delete(collection)
	})
}
