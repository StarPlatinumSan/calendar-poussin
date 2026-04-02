import supabase from './supabaseClient.js'

const TABLE_NAME = 'push_subscriptions'

function mapRowToSubscription(row) {
	if (!row) {
		return null
	}

	return {
		id: row.id,
		userId: row.user_id,
		endpoint: row.endpoint,
		expirationTime: row.expiration_time,
		keys: {
			p256dh: row.p256dh,
			auth: row.auth,
		},
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}
}

function mapSubscriptionToRow(userId, subscription, userAgent) {
	return {
		user_id: userId,
		endpoint: subscription.endpoint,
		expiration_time: subscription.expirationTime ?? null,
		p256dh: subscription?.keys?.p256dh ?? '',
		auth: subscription?.keys?.auth ?? '',
		user_agent: userAgent || null,
	}
}

async function listByUserId(userId) {
	const { data, error } = await supabase
		.from(TABLE_NAME)
		.select('*')
		.eq('user_id', userId)

	if (error) {
		throw error
	}

	return (data || []).map(mapRowToSubscription)
}

async function upsertSubscription(userId, subscription, userAgent) {
	const rowPayload = mapSubscriptionToRow(userId, subscription, userAgent)

	const { data, error } = await supabase
		.from(TABLE_NAME)
		.upsert(rowPayload, { onConflict: 'endpoint' })
		.select('*')
		.single()

	if (error) {
		throw error
	}

	return mapRowToSubscription(data)
}

async function deleteByEndpoint(endpoint) {
	const { error } = await supabase
		.from(TABLE_NAME)
		.delete()
		.eq('endpoint', endpoint)

	if (error) {
		throw error
	}
}

export default {
	listByUserId,
	upsertSubscription,
	deleteByEndpoint,
}
