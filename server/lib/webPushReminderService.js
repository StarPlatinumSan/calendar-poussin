const TIMING_OPTIONS = [
	{ id: "2d", label: "2 jours avant", offsetMs: 2 * 24 * 60 * 60 * 1000 },
	{ id: "1d", label: "1 jour avant", offsetMs: 24 * 60 * 60 * 1000 },
	{ id: "1h", label: "1 heure avant", offsetMs: 60 * 60 * 1000 },
	{ id: "0m", label: "Au moment", offsetMs: 0 },
];
const SEND_TOLERANCE_MS = 5 * 1000;

const TIMING_OFFSETS_BY_ID = TIMING_OPTIONS.reduce((accumulator, option) => {
	accumulator[option.id] = option;
	return accumulator;
}, {});

function clampText(value, maxLength = 140) {
	if (typeof value !== "string") {
		return "";
	}

	return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

function buildPushPayload(event, timingId) {
	const timingOption = TIMING_OFFSETS_BY_ID[timingId];
	return JSON.stringify({
		title: `Rappel: ${clampText(event.title || "Evenement")}`,
		body: timingOption?.label || "Rappel calendrier",
		data: {
			eventId: event.id,
			startUTC: event.startUTC,
			endUTC: event.endUTC,
			timingId,
		},
	});
}

function buildEventMap(events) {
	const eventsById = {};

	events.forEach((event) => {
		if (event?.id) {
			eventsById[event.id] = event;
		}
	});

	return eventsById;
}

export function startWebPushReminderScheduler({ webPush, reminderPreferencesRepository, reminderDeliveryLogRepository, sharedCalendarEventsRepository, pushSubscriptionsRepository, intervalMs = 30 * 1000 }) {
	let inFlight = false;

	async function runCycle() {
		if (inFlight) {
			return;
		}

		inFlight = true;

		try {
			const enabledPreferences = await reminderPreferencesRepository.listAllEnabled();

			if (enabledPreferences.length === 0) {
				return;
			}

			const uniqueEventIds = Array.from(new Set(enabledPreferences.map((pref) => pref.eventId).filter(Boolean)));
			const events = await sharedCalendarEventsRepository.listEventsByIds(uniqueEventIds);
			const nowMs = Date.now();
			const cycleWindowStartMs = nowMs - intervalMs;
			const cycleWindowEndMs = nowMs + SEND_TOLERANCE_MS;
			const eventsById = buildEventMap(events);
			const subscriptionsByUserId = {};

			for (const preference of enabledPreferences) {
				const event = eventsById[preference.eventId];

				if (!event || !event.startUTC || !Array.isArray(preference.timings) || preference.timings.length === 0) {
					continue;
				}

				const startMs = Date.parse(event.startUTC);
				if (!Number.isFinite(startMs)) {
					continue;
				}

				for (const timingId of preference.timings) {
					const timingOption = TIMING_OFFSETS_BY_ID[timingId];
					if (!timingOption) {
						continue;
					}

					const triggerMs = startMs - timingOption.offsetMs;
					if (triggerMs < cycleWindowStartMs || triggerMs > cycleWindowEndMs) {
						continue;
					}

					const shouldSend = await reminderDeliveryLogRepository.registerDelivery(preference.userId, event.id, timingId, triggerMs);

					if (!shouldSend) {
						continue;
					}

					if (!subscriptionsByUserId[preference.userId]) {
						subscriptionsByUserId[preference.userId] = await pushSubscriptionsRepository.listByUserId(preference.userId);
					}

					const subscriptions = subscriptionsByUserId[preference.userId] || [];
					if (subscriptions.length === 0) {
						continue;
					}

					const payload = buildPushPayload(event, timingId);

					await Promise.all(
						subscriptions.map(async (subscription) => {
							try {
								await webPush.sendNotification(subscription, payload, { TTL: 60 });
							} catch (error) {
								const statusCode = error?.statusCode;
								if (statusCode === 404 || statusCode === 410) {
									await pushSubscriptionsRepository.deleteByEndpoint(subscription.endpoint);
									return;
								}

								console.error(
									"[web-push] send failed",
									JSON.stringify({
										statusCode,
										message: error?.message || "unknown error",
										endpoint: subscription.endpoint,
									}),
								);
							}
						}),
					);
				}
			}
		} catch (error) {
			console.error("[web-push] scheduler cycle failed", JSON.stringify(error, null, 2));
		} finally {
			inFlight = false;
		}
	}

	const intervalId = setInterval(() => {
		runCycle();
	}, intervalMs);

	runCycle();

	return () => {
		clearInterval(intervalId);
	};
}

export { TIMING_OPTIONS };
