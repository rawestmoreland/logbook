/**
* This file was @generated using pocketbase-typegen
*/

import type PocketBase from 'pocketbase'
import type { RecordService } from 'pocketbase'

export const Collections = {
	Authorigins: "_authOrigins",
	Externalauths: "_externalAuths",
	Mfas: "_mfas",
	Otps: "_otps",
	Superusers: "_superusers",
	Aircraft: "aircraft",
	AircraftModels: "aircraft_models",
	Airports: "airports",
	Endorsements: "endorsements",
	Flights: "flights",
	Manufacturers: "manufacturers",
	PilotAircraft: "pilot_aircraft",
	Pilots: "pilots",
	RegulatoryProfiles: "regulatory_profiles",
	Users: "users",
} as const
export type Collections = typeof Collections[keyof typeof Collections]

// Alias types for improved usability
export type IsoDateString = string
export type IsoAutoDateString = string & { readonly autodate: unique symbol }
export type RecordIdString = string
export type FileNameString = string & { readonly filename: unique symbol }
export type HTMLString = string

type ExpandType<T> = unknown extends T
	? T extends unknown
		? { expand?: unknown }
		: { expand: T }
	: { expand: T }

// System fields
export type BaseSystemFields<T = unknown> = {
	id: RecordIdString
	collectionId: string
	collectionName: Collections
} & ExpandType<T>

export type AuthSystemFields<T = unknown> = {
	email: string
	emailVisibility: boolean
	username: string
	verified: boolean
} & BaseSystemFields<T>

// Record types for each collection

export type AuthoriginsRecord = {
	collectionRef: string
	created: IsoAutoDateString
	fingerprint: string
	id: string
	recordRef: string
	updated: IsoAutoDateString
}

export type ExternalauthsRecord = {
	collectionRef: string
	created: IsoAutoDateString
	id: string
	provider: string
	providerId: string
	recordRef: string
	updated: IsoAutoDateString
}

export type MfasRecord = {
	collectionRef: string
	created: IsoAutoDateString
	id: string
	method: string
	recordRef: string
	updated: IsoAutoDateString
}

export type OtpsRecord = {
	collectionRef: string
	created: IsoAutoDateString
	id: string
	password: string
	recordRef: string
	sentTo?: string
	updated: IsoAutoDateString
}

export type SuperusersRecord = {
	created: IsoAutoDateString
	email: string
	emailVisibility?: boolean
	id: string
	password: string
	tokenKey: string
	updated: IsoAutoDateString
	verified?: boolean
}

export const AircraftInstanceTypeOptions = {
	"real": "real",
	"uncertified_sim": "uncertified_sim",
	"certified_ifr_sim": "certified_ifr_sim",
	"certified_ifr_landings_sim": "certified_ifr_landings_sim",
	"certified_atd": "certified_atd",
} as const
export type AircraftInstanceTypeOptions = typeof AircraftInstanceTypeOptions[keyof typeof AircraftInstanceTypeOptions]
export type AircraftRecord = {
	created: IsoAutoDateString
	deleted?: boolean
	id: string
	instance_type?: AircraftInstanceTypeOptions
	model: RecordIdString
	tail_number: string
	updated: IsoAutoDateString
}

export const AircraftModelsCategoryClassOptions = {
	"airplane_single_engine_land": "airplane_single_engine_land",
	"airplane_multi_engine_land": "airplane_multi_engine_land",
	"airplane_single_engine_sea": "airplane_single_engine_sea",
	"airplane_multi_engine_sea": "airplane_multi_engine_sea",
	"rotorcraft_helicopter": "rotorcraft_helicopter",
	"rotorcraft_gyroplane": "rotorcraft_gyroplane",
	"glider": "glider",
	"lighter_than_air_airship": "lighter_than_air_airship",
	"lighter_than_air_balloon": "lighter_than_air_balloon",
	"powered_lift": "powered_lift",
	"powered_parachute_land": "powered_parachute_land",
	"powered_parachute_sea": "powered_parachute_sea",
	"weight_shift_control_land": "weight_shift_control_land",
	"weight_shift_control_sea": "weight_shift_control_sea",
} as const
export type AircraftModelsCategoryClassOptions = typeof AircraftModelsCategoryClassOptions[keyof typeof AircraftModelsCategoryClassOptions]
export type AircraftModelsRecord = {
	category_class: AircraftModelsCategoryClassOptions
	common_name?: string
	complex?: boolean
	created: IsoAutoDateString
	high_performance?: boolean
	id: string
	manufacturer: RecordIdString
	model: string
	tailwheel?: boolean
	updated: IsoAutoDateString
}

export const AirportsTypeOptions = {
	"large_airport": "large_airport",
	"medium_airport": "medium_airport",
	"small_airport": "small_airport",
	"heliport": "heliport",
	"seaplane_base": "seaplane_base",
	"balloonport": "balloonport",
} as const
export type AirportsTypeOptions = typeof AirportsTypeOptions[keyof typeof AirportsTypeOptions]
export type AirportsRecord = {
	country?: string
	created: IsoAutoDateString
	elevation_ft?: number
	iata?: string
	icao?: string
	id: string
	ident: string
	lat?: number
	lon?: number
	municipality?: string
	name: string
	region?: string
	type: AirportsTypeOptions
	updated: IsoAutoDateString
}

export const EndorsementsTypeOptions = {
	"flight_review": "flight_review",
} as const
export type EndorsementsTypeOptions = typeof EndorsementsTypeOptions[keyof typeof EndorsementsTypeOptions]
export type EndorsementsRecord = {
	created: IsoAutoDateString
	date?: IsoDateString
	deleted?: boolean
	flight?: RecordIdString
	id: string
	instructor?: RecordIdString
	signature?: FileNameString
	text?: string
	type?: EndorsementsTypeOptions
	updated: IsoAutoDateString
}

export type FlightsRecord = {
	actual_instrument?: number
	aircraft?: RecordIdString
	approaches?: number
	course_tracking?: boolean
	created: IsoAutoDateString
	date?: IsoDateString
	day_landings?: number
	day_landings_full_stop?: number
	deleted?: boolean
	dual_time?: number
	endorsement?: RecordIdString
	holding?: boolean
	id: string
	instructor?: RecordIdString
	night_landings?: number
	night_time?: number
	pic_time?: number
	pilot?: RecordIdString
	remarks?: string
	route_from?: string
	route_to?: string
	sic_time?: number
	sim_instrument?: number
	solo_time?: number
	total_time?: number
	updated: IsoAutoDateString
}

export type ManufacturersRecord = {
	created: IsoAutoDateString
	id: string
	name: string
	updated: IsoAutoDateString
}

export type PilotAircraftRecord = {
	aircraft: RecordIdString
	created: IsoAutoDateString
	deleted?: boolean
	id: string
	pilot: RecordIdString
	updated: IsoAutoDateString
}

export const PilotsMedicalClassOptions = {
	"first": "first",
	"second": "second",
	"third": "third",
} as const
export type PilotsMedicalClassOptions = typeof PilotsMedicalClassOptions[keyof typeof PilotsMedicalClassOptions]
export type PilotsRecord<Tlicenses = unknown> = {
	birthdate?: IsoDateString
	created: IsoAutoDateString
	deleted?: boolean
	id: string
	licenses?: null | Tlicenses
	medical_class?: PilotsMedicalClassOptions
	medical_expiry?: IsoDateString
	medical_issued?: IsoDateString
	name?: string
	updated: IsoAutoDateString
	user?: RecordIdString
}

export type RegulatoryProfilesRecord<Trules = unknown> = {
	created: IsoAutoDateString
	deleted?: boolean
	id: string
	name?: string
	rules?: null | Trules
	updated: IsoAutoDateString
}

export type UsersRecord = {
	avatar?: FileNameString
	created: IsoAutoDateString
	email: string
	emailVisibility?: boolean
	id: string
	name?: string
	password: string
	tokenKey: string
	updated: IsoAutoDateString
	verified?: boolean
}

// Response types include system fields and match responses from the PocketBase API
export type AuthoriginsResponse<Texpand = unknown> = Required<AuthoriginsRecord> & BaseSystemFields<Texpand>
export type ExternalauthsResponse<Texpand = unknown> = Required<ExternalauthsRecord> & BaseSystemFields<Texpand>
export type MfasResponse<Texpand = unknown> = Required<MfasRecord> & BaseSystemFields<Texpand>
export type OtpsResponse<Texpand = unknown> = Required<OtpsRecord> & BaseSystemFields<Texpand>
export type SuperusersResponse<Texpand = unknown> = Required<SuperusersRecord> & AuthSystemFields<Texpand>
export type AircraftResponse<Texpand = unknown> = Required<AircraftRecord> & BaseSystemFields<Texpand>
export type AircraftModelsResponse<Texpand = unknown> = Required<AircraftModelsRecord> & BaseSystemFields<Texpand>
export type AirportsResponse<Texpand = unknown> = Required<AirportsRecord> & BaseSystemFields<Texpand>
export type EndorsementsResponse<Texpand = unknown> = Required<EndorsementsRecord> & BaseSystemFields<Texpand>
export type FlightsResponse<Texpand = unknown> = Required<FlightsRecord> & BaseSystemFields<Texpand>
export type ManufacturersResponse<Texpand = unknown> = Required<ManufacturersRecord> & BaseSystemFields<Texpand>
export type PilotAircraftResponse<Texpand = unknown> = Required<PilotAircraftRecord> & BaseSystemFields<Texpand>
export type PilotsResponse<Tlicenses = unknown, Texpand = unknown> = Required<PilotsRecord<Tlicenses>> & BaseSystemFields<Texpand>
export type RegulatoryProfilesResponse<Trules = unknown, Texpand = unknown> = Required<RegulatoryProfilesRecord<Trules>> & BaseSystemFields<Texpand>
export type UsersResponse<Texpand = unknown> = Required<UsersRecord> & AuthSystemFields<Texpand>

// Types containing all Records and Responses, useful for creating typing helper functions

export type CollectionRecords = {
	_authOrigins: AuthoriginsRecord
	_externalAuths: ExternalauthsRecord
	_mfas: MfasRecord
	_otps: OtpsRecord
	_superusers: SuperusersRecord
	aircraft: AircraftRecord
	aircraft_models: AircraftModelsRecord
	airports: AirportsRecord
	endorsements: EndorsementsRecord
	flights: FlightsRecord
	manufacturers: ManufacturersRecord
	pilot_aircraft: PilotAircraftRecord
	pilots: PilotsRecord
	regulatory_profiles: RegulatoryProfilesRecord
	users: UsersRecord
}

export type CollectionResponses = {
	_authOrigins: AuthoriginsResponse
	_externalAuths: ExternalauthsResponse
	_mfas: MfasResponse
	_otps: OtpsResponse
	_superusers: SuperusersResponse
	aircraft: AircraftResponse
	aircraft_models: AircraftModelsResponse
	airports: AirportsResponse
	endorsements: EndorsementsResponse
	flights: FlightsResponse
	manufacturers: ManufacturersResponse
	pilot_aircraft: PilotAircraftResponse
	pilots: PilotsResponse
	regulatory_profiles: RegulatoryProfilesResponse
	users: UsersResponse
}

// Utility types for create/update operations

type ProcessCreateAndUpdateFields<T> = Omit<{
	// Omit AutoDate fields
	[K in keyof T as Extract<T[K], IsoAutoDateString> extends never ? K : never]: 
		// Convert FileNameString to File
		T[K] extends infer U ? 
			U extends (FileNameString | FileNameString[]) ? 
				U extends any[] ? File[] : File 
			: U
		: never
}, 'id'>

// Create type for Auth collections
export type CreateAuth<T> = {
	id?: RecordIdString
	email: string
	emailVisibility?: boolean
	password: string
	passwordConfirm: string
	verified?: boolean
} & ProcessCreateAndUpdateFields<T>

// Create type for Base collections
export type CreateBase<T> = {
	id?: RecordIdString
} & ProcessCreateAndUpdateFields<T>

// Update type for Auth collections
export type UpdateAuth<T> = Partial<
	Omit<ProcessCreateAndUpdateFields<T>, keyof AuthSystemFields>
> & {
	email?: string
	emailVisibility?: boolean
	oldPassword?: string
	password?: string
	passwordConfirm?: string
	verified?: boolean
}

// Update type for Base collections
export type UpdateBase<T> = Partial<
	Omit<ProcessCreateAndUpdateFields<T>, keyof BaseSystemFields>
>

// Get the correct create type for any collection
export type Create<T extends keyof CollectionResponses> =
	CollectionResponses[T] extends AuthSystemFields
		? CreateAuth<CollectionRecords[T]>
		: CreateBase<CollectionRecords[T]>

// Get the correct update type for any collection
export type Update<T extends keyof CollectionResponses> =
	CollectionResponses[T] extends AuthSystemFields
		? UpdateAuth<CollectionRecords[T]>
		: UpdateBase<CollectionRecords[T]>

// Type for usage with type asserted PocketBase instance
// https://github.com/pocketbase/js-sdk#specify-typescript-definitions

export type TypedPocketBase = {
	collection<T extends keyof CollectionResponses>(
		idOrName: T
	): RecordService<CollectionResponses[T]>
} & PocketBase
