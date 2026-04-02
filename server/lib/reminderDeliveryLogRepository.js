import { DateTime } from 'luxon'
import supabase from './supabaseClient.js'

const TABLE_NAME = 'event_reminder_delivery_log'

async function registerDelivery(userId, eventId, timingId, triggerAt) {
	const triggerAtISO = triggerAt instanceof Date ? triggerAt.toISOString() : DateTime.fromMillis(triggerAt).toUTC().toISO()

	const { error } = await supabase.from(TABLE_NAME).insert({
		user_id: userId,
		event_id: eventId,
		timing_id: timingId,
		trigger_at: triggerAtISO,
	})

	if (!error) {
		return true
	}

	if (error.code === '23505') {
		return false
	}

	throw error
}

export default {
	registerDelivery,
}
