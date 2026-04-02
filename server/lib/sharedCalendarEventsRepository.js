import supabase from './supabaseClient.js'

const TABLE_NAME = 'shared_calendar_events'

function mapRowToEvent(row) {
	if (!row) {
		return null
	}

	return {
		id: row.id,
		title: row.title,
		startUTC: row.start_utc,
		endUTC: row.end_utc,
		createdBy: row.created_by,
		preserveForever: Boolean(row.preserve_forever),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}
}

function mapPayloadToRow(payload) {
	if (!payload) {
		return {}
	}

	const row = {}

	if (payload.title !== undefined) {
		row.title = payload.title
	}

	if (payload.startUTC !== undefined) {
		row.start_utc = payload.startUTC
	}

	if (payload.endUTC !== undefined) {
		row.end_utc = payload.endUTC
	}

	if (payload.createdBy !== undefined) {
		row.created_by = payload.createdBy
	}

	if (payload.preserveForever !== undefined) {
		row.preserve_forever = Boolean(payload.preserveForever)
	}

	return row
}

async function listEvents() {
	const { data, error } = await supabase.from(TABLE_NAME).select('*').order('start_utc', { ascending: true })

	if (error) {
		throw error
	}

	return (data || []).map(mapRowToEvent)
}

async function listEventsByIds(ids = []) {
	if (!Array.isArray(ids) || ids.length === 0) {
		return []
	}

	const { data, error } = await supabase
		.from(TABLE_NAME)
		.select('*')
		.in('id', ids)

	if (error) {
		throw error
	}

	return (data || []).map(mapRowToEvent)
}

async function createEvent(payload) {
	const rowPayload = mapPayloadToRow(payload)

	const { data, error } = await supabase.from(TABLE_NAME).insert(rowPayload).select('*').single()

	if (error) {
		throw error
	}

	return mapRowToEvent(data)
}

async function updateEvent(id, payload) {
	const rowPayload = mapPayloadToRow(payload)

	const { data, error } = await supabase.from(TABLE_NAME).update(rowPayload).eq('id', id).select('*').single()

	if (error) {
		throw error
	}

	return mapRowToEvent(data)
}

async function deleteEvent(id) {
	const { error } = await supabase.from(TABLE_NAME).delete().eq('id', id)

	if (error) {
		throw error
	}
}

async function deleteEventsEndedBefore(cutoffUtcISO) {
	const { data, error } = await supabase
		.from(TABLE_NAME)
		.delete()
		.lt('end_utc', cutoffUtcISO)
		.eq('preserve_forever', false)
		.select('id')

	if (error) {
		throw error
	}

	return Array.isArray(data) ? data.length : 0
}

export default {
	listEvents,
	listEventsByIds,
	createEvent,
	updateEvent,
	deleteEvent,
	deleteEventsEndedBefore,
}
