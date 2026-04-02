import supabase from './supabaseClient.js'

const TABLE_NAME = 'event_reminder_preferences'
const TIMING_TO_COLUMN = {
	'2d': 'remind_2d',
	'1d': 'remind_1d',
	'1h': 'remind_1h',
	'0m': 'remind_at_start',
}

function normalizeTimings(timings = []) {
	if (!Array.isArray(timings)) {
		return []
	}

	return Array.from(
		new Set(
			timings.filter((timingId) => Object.prototype.hasOwnProperty.call(TIMING_TO_COLUMN, timingId)),
		),
	)
}

function mapRowToPreference(row) {
	if (!row) {
		return null
	}

	const timings = Object.entries(TIMING_TO_COLUMN)
		.filter(([, columnName]) => Boolean(row[columnName]))
		.map(([timingId]) => timingId)

	return {
		id: row.id,
		userId: row.user_id,
		eventId: row.event_id,
		enabled: Boolean(row.enabled) && timings.length > 0,
		timings,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}
}

function mapPreferenceToRow(userId, eventId, enabled, timings) {
	const normalizedTimings = normalizeTimings(timings)
	const row = {
		user_id: userId,
		event_id: eventId,
		enabled: Boolean(enabled) && normalizedTimings.length > 0,
		remind_2d: false,
		remind_1d: false,
		remind_1h: false,
		remind_at_start: false,
	}

	normalizedTimings.forEach((timingId) => {
		row[TIMING_TO_COLUMN[timingId]] = true
	})

	return row
}

async function listByUserId(userId) {
	const { data, error } = await supabase
		.from(TABLE_NAME)
		.select('*')
		.eq('user_id', userId)

	if (error) {
		throw error
	}

	return (data || []).map(mapRowToPreference)
}

async function listAllEnabled() {
	const { data, error } = await supabase
		.from(TABLE_NAME)
		.select('*')
		.eq('enabled', true)

	if (error) {
		throw error
	}

	return (data || []).map(mapRowToPreference)
}

async function setPreference(userId, eventId, enabled, timings) {
	const normalizedTimings = normalizeTimings(timings)
	const shouldEnable = Boolean(enabled) && normalizedTimings.length > 0

	if (!shouldEnable) {
		const { error } = await supabase
			.from(TABLE_NAME)
			.delete()
			.eq('user_id', userId)
			.eq('event_id', eventId)

		if (error) {
			throw error
		}

		return {
			userId,
			eventId,
			enabled: false,
			timings: [],
		}
	}

	const rowPayload = mapPreferenceToRow(userId, eventId, true, normalizedTimings)

	const { data, error } = await supabase
		.from(TABLE_NAME)
		.upsert(rowPayload, { onConflict: 'user_id,event_id' })
		.select('*')
		.single()

	if (error) {
		throw error
	}

	return mapRowToPreference(data)
}

export default {
	listByUserId,
	listAllEnabled,
	setPreference,
}
