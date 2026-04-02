self.addEventListener("push", (event) => {
	let payload = {};

	try {
		payload = event.data ? event.data.json() : {};
	} catch {
		payload = {
			title: "Rappel calendrier",
			body: event.data ? event.data.text() : "",
		};
	}

	const title = payload.title || "Rappel calendrier";
	const body = payload.body || "Un bloc est sur le point de commencer.";
	const data = payload.data || {};

	event.waitUntil(
		self.registration.showNotification(title, {
			body,
			icon: "/poussin.png",
			badge: "/poussin.png",
			data,
		}),
	);
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();

	event.waitUntil(
		clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
			if (windowClients.length > 0) {
				const existingClient = windowClients[0];
				existingClient.focus();
				return existingClient.navigate("/");
			}

			return clients.openWindow("/");
		}),
	);
});
