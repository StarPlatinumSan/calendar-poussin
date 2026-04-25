import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DateTime } from "luxon";
import { PRIMARY_ZONE, USERS } from "../../constants/timezones";
import { useIsMobile } from "../../hooks/useIsMobile";
import { eventsForDay, formatDayLabel, formatRangeInZone } from "../../utils/dateTime";
import { formatSharedWindow, getSharedFreeWindows } from "../../utils/availability";
import CalendarHeader from "./CalendarHeader";
import DesktopMonthView from "./DesktopMonthView";
import EventComposerModal from "./EventComposerModal";
import EventDetailsPanel from "./EventDetailsPanel";
import MobileDayView from "./MobileDayView";

function getCurrentDayISO() {
	return DateTime.now().setZone(PRIMARY_ZONE).toISODate();
}

const DEFAULT_DAY = getCurrentDayISO();
const configuredApiBaseUrl = (import.meta.env.VITE_API_URL || "").trim();
const isConfiguredApiLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(configuredApiBaseUrl);
const API_BASE_URL = import.meta.env.DEV ? configuredApiBaseUrl || "http://localhost:4000" : isConfiguredApiLocalhost ? "" : configuredApiBaseUrl;
const MOBILE_OVERLAY_CLOSE_DURATION_MS = 180;
const NOTIFICATION_OPTIONS = [
	{ id: "2d", label: "2 jours avant" },
	{ id: "1d", label: "1 jour avant" },
	{ id: "1h", label: "1 heure avant" },
	{ id: "0m", label: "Au moment" },
];
const DEFAULT_NOTIFICATION_TIMINGS = ["0m"];

function getWebPushSupportStatus() {
	if (typeof window === "undefined") {
		return { supported: false, message: "Les notifications push ne sont pas disponibles dans ce contexte." };
	}

	if (!window.isSecureContext) {
		return { supported: false, message: "Les notifications push exigent une connexion HTTPS." };
	}

	if (!("Notification" in window)) {
		return { supported: false, message: "Ce navigateur ne supporte pas les notifications." };
	}

	if (!("serviceWorker" in navigator)) {
		return { supported: false, message: "Ce navigateur ne supporte pas les Service Workers." };
	}

	const hasPushManager = "PushManager" in window || (typeof ServiceWorkerRegistration !== "undefined" && "pushManager" in ServiceWorkerRegistration.prototype);
	if (!hasPushManager) {
		return { supported: false, message: "Ce navigateur ne supporte pas les notifications push." };
	}

	const userAgent = navigator.userAgent || "";
	const isIOS = /iPad|iPhone|iPod/i.test(userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
	const isStandalone = window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;

	if (isIOS && !isStandalone) {
		return { supported: false, message: "Sur iPhone, ouvre l'app depuis l'écran d'accueil pour activer les notifications." };
	}

	return { supported: true, message: "" };
}

function urlBase64ToUint8Array(base64String) {
	const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
	const rawData = atob(base64);
	const outputArray = new Uint8Array(rawData.length);

	for (let index = 0; index < rawData.length; index += 1) {
		outputArray[index] = rawData.charCodeAt(index);
	}

	return outputArray;
}

function normalizeNotificationPref(pref) {
	const timings = Array.isArray(pref?.timings) ? Array.from(new Set(pref.timings.filter((timingId) => NOTIFICATION_OPTIONS.some((option) => option.id === timingId)))) : [];
	const enabled = Boolean(pref?.enabled) && timings.length > 0;

	return {
		enabled,
		timings,
	};
}

function mapPreferencesArrayToMap(preferences) {
	if (!Array.isArray(preferences)) {
		return {};
	}

	return preferences.reduce((accumulator, pref) => {
		if (!pref?.eventId) {
			return accumulator;
		}

		return {
			...accumulator,
			[pref.eventId]: normalizeNotificationPref(pref),
		};
	}, {});
}

async function apiFetch(path, { method = "GET", body } = {}) {
	const response = await fetch(`${API_BASE_URL}${path}`, {
		method,
		credentials: "include",
		headers: body ? { "Content-Type": "application/json" } : undefined,
		body: body ? JSON.stringify(body) : undefined,
	});

	if (!response.ok) {
		let errorMessage = `Request failed: ${response.status}`;

		try {
			const payload = await response.json();
			errorMessage = payload?.error || payload?.message || errorMessage;
		} catch {
			// Keep the generic message if the body is not JSON.
		}

		const requestError = new Error(errorMessage);
		requestError.status = response.status;
		throw requestError;
	}

	if (response.status === 204) {
		return null;
	}

	return response.json();
}

export default function SharedCalendar({ user, onLogout }) {
	const [events, setEvents] = useState([]);
	const [selectedDayISO, setSelectedDayISO] = useState(DEFAULT_DAY);
	const [monthCursor, setMonthCursor] = useState(DateTime.fromISO(DEFAULT_DAY, { zone: PRIMARY_ZONE }).startOf("month"));
	const [activeEvent, setActiveEvent] = useState(null);
	const [editingEvent, setEditingEvent] = useState(null);
	const [isComposerOpen, setIsComposerOpen] = useState(false);
	const [isDesktopDayLocked, setIsDesktopDayLocked] = useState(false);
	const [notificationPrefs, setNotificationPrefs] = useState({});
	const [notificationPermission, setNotificationPermission] = useState(() => (typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"));
	const [notificationError, setNotificationError] = useState("");
	const [webPushSupport, setWebPushSupport] = useState(() => getWebPushSupportStatus());
	const [mobileOverlayEvent, setMobileOverlayEvent] = useState(null);
	const [isMobileOverlayClosing, setIsMobileOverlayClosing] = useState(false);
	const isMobile = useIsMobile(900);
	const serviceWorkerRegistrationRef = useRef(null);
	const vapidPublicKeyRef = useRef("");
	const mobileOverlayCloseTimeoutRef = useRef(null);
	const webPushSupported = webPushSupport.supported;

	const ensurePushSubscription = useCallback(
		async ({ requestPermission }) => {
			if (!webPushSupported) {
				setNotificationPermission("unsupported");
				setNotificationError(webPushSupport.message || "Web Push n'est pas supporte sur ce navigateur.");
				return false;
			}

			try {
				let permission = Notification.permission;
				if (permission !== "granted" && requestPermission) {
					permission = await Notification.requestPermission();
				}

				setNotificationPermission(permission);

				if (permission !== "granted") {
					setNotificationError("Autorise les notifications pour activer les rappels push.");
					return false;
				}

				let registration = serviceWorkerRegistrationRef.current;
				if (!registration) {
					registration = await navigator.serviceWorker.register("/sw.js");
					serviceWorkerRegistrationRef.current = registration;
				}

				let subscription = await registration.pushManager.getSubscription();
				if (!subscription) {
					let publicKey = vapidPublicKeyRef.current;
					if (!publicKey) {
						const keyPayload = await apiFetch("/api/push/public-key");
						publicKey = typeof keyPayload?.publicKey === "string" ? keyPayload.publicKey : "";
						vapidPublicKeyRef.current = publicKey;
					}

					if (!publicKey) {
						throw new Error("Missing VAPID public key");
					}

					subscription = await registration.pushManager.subscribe({
						userVisibleOnly: true,
						applicationServerKey: urlBase64ToUint8Array(publicKey),
					});
				}

				await apiFetch("/api/push/subscribe", {
					method: "POST",
					body: { subscription },
				});

				setNotificationError("");
				return true;
			} catch (error) {
				if (error?.status === 503) {
					setNotificationError("Le serveur n'a pas la configuration Web Push (VAPID) active.");
					return false;
				}

				setNotificationError(error?.message || "Impossible d'activer les notifications push.");
				return false;
			}
		},
		[webPushSupport.message, webPushSupported],
	);

	useEffect(() => {
		let isMounted = true;

		const loadData = async () => {
			let eventsPayload = null;

			try {
				eventsPayload = await apiFetch("/api/events");
			} catch {
				if (isMounted) {
					setEvents([]);
				}
				return;
			}

			if (!isMounted) {
				return;
			}

			setEvents(Array.isArray(eventsPayload?.events) ? eventsPayload.events : []);

			try {
				const remindersPayload = await apiFetch("/api/reminders/preferences");
				if (!isMounted) {
					return;
				}

				setNotificationPrefs(mapPreferencesArrayToMap(remindersPayload?.preferences));
			} catch {
				if (isMounted) {
					setNotificationPrefs({});
				}
			}
		};

		loadData();

		return () => {
			isMounted = false;
		};
	}, []);

	useEffect(() => {
		const support = getWebPushSupportStatus();
		setWebPushSupport(support);

		if (!support.supported) {
			return;
		}

		setNotificationPermission(Notification.permission);

		if (Notification.permission === "granted") {
			ensurePushSubscription({ requestPermission: false });
		}
	}, [ensurePushSubscription]);

	useEffect(() => {
		return () => {
			window.clearTimeout(mobileOverlayCloseTimeoutRef.current);
		};
	}, []);

	useEffect(() => {
		if (!isMobile) {
			window.clearTimeout(mobileOverlayCloseTimeoutRef.current);
			setIsMobileOverlayClosing(false);
			setMobileOverlayEvent(null);
			return;
		}

		const shouldOpenOverlay = Boolean(activeEvent) && !isComposerOpen;

		if (shouldOpenOverlay) {
			window.clearTimeout(mobileOverlayCloseTimeoutRef.current);
			setIsMobileOverlayClosing(false);
			setMobileOverlayEvent(activeEvent);
			return;
		}

		if (!mobileOverlayEvent || isMobileOverlayClosing) {
			return;
		}

		setIsMobileOverlayClosing(true);
		window.clearTimeout(mobileOverlayCloseTimeoutRef.current);
		mobileOverlayCloseTimeoutRef.current = window.setTimeout(() => {
			setIsMobileOverlayClosing(false);
			setMobileOverlayEvent(null);
		}, MOBILE_OVERLAY_CLOSE_DURATION_MS);
	}, [activeEvent, isComposerOpen, isMobile, isMobileOverlayClosing, mobileOverlayEvent]);

	const sharedFreeWindows = useMemo(() => getSharedFreeWindows(events, selectedDayISO, PRIMARY_ZONE), [events, selectedDayISO]);
	const dayEvents = useMemo(() => eventsForDay(events, selectedDayISO, PRIMARY_ZONE), [events, selectedDayISO]);

	const activeEventNotificationPref = useMemo(() => {
		if (!activeEvent?.id) {
			return { enabled: false, timings: [] };
		}

		const pref = normalizeNotificationPref(notificationPrefs[activeEvent.id]);
		return pref.enabled || pref.timings.length > 0 ? pref : { enabled: false, timings: DEFAULT_NOTIFICATION_TIMINGS };
	}, [activeEvent?.id, notificationPrefs]);

	const persistNotificationPreference = useCallback(async (eventId, enabled, timings) => {
		const response = await apiFetch(`/api/reminders/preferences/${eventId}`, {
			method: "PUT",
			body: {
				enabled,
				timings,
			},
		});

		const nextPreference = normalizeNotificationPref(response?.preference);
		setNotificationPrefs((current) => ({
			...current,
			[eventId]: nextPreference,
		}));
		setNotificationError("");
	}, []);

	const handleToggleEventNotifications = async (eventId, enabled) => {
		const existing = normalizeNotificationPref(notificationPrefs[eventId]);
		const nextTimings = existing.timings.length > 0 ? existing.timings : [...DEFAULT_NOTIFICATION_TIMINGS];

		if (enabled) {
			const ready = await ensurePushSubscription({ requestPermission: true });
			if (!ready) {
				return;
			}
		}

		try {
			await persistNotificationPreference(eventId, enabled, nextTimings);
		} catch {
			setNotificationError("Impossible d'enregistrer la preference de rappel.");
		}
	};

	const handleToggleEventNotificationTiming = async (eventId, timingId, checked) => {
		const existing = normalizeNotificationPref(notificationPrefs[eventId]);
		const sourceTimings = existing.timings.length > 0 ? existing.timings : [...DEFAULT_NOTIFICATION_TIMINGS];
		const nextTimings = checked ? Array.from(new Set([...sourceTimings, timingId])) : sourceTimings.filter((item) => item !== timingId);
		const enabled = nextTimings.length > 0;

		if (checked) {
			const ready = await ensurePushSubscription({ requestPermission: true });
			if (!ready) {
				return;
			}
		}

		try {
			await persistNotificationPreference(eventId, enabled, nextTimings);
		} catch {
			setNotificationError("Impossible d'enregistrer la preference de rappel.");
		}
	};

	const handleCreate = () => {
		setEditingEvent(null);
		setIsComposerOpen(true);
	};

	const handleEdit = (event) => {
		setEditingEvent(event);
		setActiveEvent(event);
		setIsComposerOpen(true);
	};

	const handleDeleteEvent = async (eventId) => {
		await apiFetch(`/api/events/${eventId}`, {
			method: "DELETE",
		});
		setEvents((current) => current.filter((event) => event.id !== eventId));
		setNotificationPrefs((current) => {
			if (!current[eventId]) {
				return current;
			}

			const next = { ...current };
			delete next[eventId];
			return next;
		});
		setActiveEvent((current) => (current?.id === eventId ? null : current));
		setEditingEvent((current) => (current?.id === eventId ? null : current));
		setIsComposerOpen(false);
	};

	const handleTogglePreserveEvent = async (eventId, preserveForever) => {
		const response = await apiFetch(`/api/events/${eventId}`, {
			method: "PUT",
			body: { preserveForever },
		});
		const savedEvent = response?.event;

		if (!savedEvent) {
			return;
		}

		setEvents((current) => current.map((item) => (item.id === savedEvent.id ? savedEvent : item)));
		setActiveEvent((current) => (current?.id === savedEvent.id ? savedEvent : current));
		setEditingEvent((current) => (current?.id === savedEvent.id ? savedEvent : current));
	};

	const handleSaveEvent = async (event) => {
		const payload = {
			title: event.title,
			startUTC: event.startUTC,
			endUTC: event.endUTC,
			createdBy: event.createdBy,
		};
		const response = editingEvent?.id
			? await apiFetch(`/api/events/${editingEvent.id}`, {
					method: "PUT",
					body: payload,
				})
			: await apiFetch("/api/events", {
					method: "POST",
					body: payload,
				});
		const savedEvent = response?.event;

		if (!savedEvent) {
			return;
		}

		setEvents((current) => {
			const hasExistingEvent = current.some((item) => item.id === savedEvent.id);
			const merged = hasExistingEvent ? current.map((item) => (item.id === savedEvent.id ? savedEvent : item)) : [...current, savedEvent];

			return merged.sort((left, right) => left.startUTC.localeCompare(right.startUTC));
		});

		setActiveEvent(savedEvent);
		setEditingEvent(null);
		setSelectedDayISO(DateTime.fromISO(savedEvent.startUTC, { zone: "utc" }).setZone(PRIMARY_ZONE).toISODate());
		setMonthCursor((current) => {
			const eventMonth = DateTime.fromISO(savedEvent.startUTC, { zone: "utc" }).setZone(PRIMARY_ZONE).startOf("month");
			return current.hasSame(eventMonth, "month") ? current : eventMonth;
		});
		setIsComposerOpen(false);
	};

	const handleToday = () => {
		const todayISO = getCurrentDayISO();
		setSelectedDayISO(todayISO);
		setMonthCursor(DateTime.fromISO(todayISO, { zone: PRIMARY_ZONE }).startOf("month"));
		setIsDesktopDayLocked(false);
	};

	const shiftDay = (amount) => {
		const nextDay = DateTime.fromISO(selectedDayISO, { zone: PRIMARY_ZONE }).plus({ days: amount }).toISODate();
		setSelectedDayISO(nextDay);
		setMonthCursor(DateTime.fromISO(nextDay, { zone: PRIMARY_ZONE }).startOf("month"));
	};

	const shiftMonth = (amount) => {
		const nextMonth = monthCursor.plus({ months: amount }).startOf("month");
		setMonthCursor(nextMonth);
		setIsDesktopDayLocked(false);
		setSelectedDayISO((current) => {
			const selected = DateTime.fromISO(current, { zone: PRIMARY_ZONE });
			if (selected.hasSame(nextMonth, "month")) {
				return current;
			}
			return nextMonth.startOf("month").toISODate();
		});
	};

	const handleLockDay = (dayISO) => {
		setSelectedDayISO(dayISO);
		setIsDesktopDayLocked(true);
	};

	const handleCloseMobileOverlay = () => {
		setActiveEvent(null);
	};

	const isDayLocked = !isMobile && isDesktopDayLocked;
	const showMobileEventOverlay = isMobile && Boolean(mobileOverlayEvent);

	return (
		<div className="app-shell">
			<div className="calendar-surface">
				<CalendarHeader
					isMobile={isMobile}
					isDayLocked={isDayLocked}
					monthCursor={monthCursor}
					selectedDayISO={selectedDayISO}
					onPrevious={() => (isMobile || isDayLocked ? shiftDay(-1) : shiftMonth(-1))}
					onNext={() => (isMobile || isDayLocked ? shiftDay(1) : shiftMonth(1))}
					onToday={handleToday}
					onCreate={handleCreate}
					onUnlockDay={() => setIsDesktopDayLocked(false)}
					user={user}
					onLogout={onLogout}
				/>

				<div className="calendar-main">
					<div className="calendar-main__board">
						{isMobile || isDayLocked ? (
							<MobileDayView
								dayISO={selectedDayISO}
								events={events}
								sharedFreeWindows={sharedFreeWindows}
								onShiftDay={shiftDay}
								onSelectEvent={setActiveEvent}
								onOpenCreateForDay={(dayISO) => {
									setSelectedDayISO(dayISO);
									setEditingEvent(null);
									setIsComposerOpen(true);
								}}
								enableSwipe={isMobile}
								hintText={isMobile ? "Glisse à gauche/droite pour changer de jour" : "Vue verrouillee heure par heure"}
							/>
						) : (
							<DesktopMonthView
								monthCursor={monthCursor}
								selectedDayISO={selectedDayISO}
								events={events}
								onLockDay={handleLockDay}
								onOpenCreateForDay={(dayISO) => {
									setSelectedDayISO(dayISO);
									setEditingEvent(null);
									setIsComposerOpen(true);
								}}
								onSelectEvent={setActiveEvent}
							/>
						)}
					</div>

					<aside className="calendar-main__side">
						{!isMobile ? (
							<EventDetailsPanel
								event={activeEvent}
								onEdit={handleEdit}
								onDelete={handleDeleteEvent}
								onTogglePreserve={handleTogglePreserveEvent}
								notificationPreference={activeEventNotificationPref}
								notificationOptions={NOTIFICATION_OPTIONS}
								onToggleNotificationEnabled={handleToggleEventNotifications}
								onToggleNotificationTiming={handleToggleEventNotificationTiming}
								notificationSupported={webPushSupported}
								notificationSupportHint={webPushSupport.message}
								notificationPermission={notificationPermission}
								notificationError={notificationError}
							/>
						) : null}

						<section className="availability-panel">
							<h3>Créneaux libres en commun</h3>
							<p>{formatDayLabel(selectedDayISO, USERS.canada.zone)}</p>
							{sharedFreeWindows.length === 0 ? (
								<p>Aucun créneau commun de 30 min ou plus.</p>
							) : (
								<ul>
									{sharedFreeWindows.map(([startMinute, endMinute]) => {
										const labels = formatSharedWindow(selectedDayISO, startMinute, endMinute, PRIMARY_ZONE);

										return (
											<li key={`${startMinute}-${endMinute}`}>
												<span>
													{USERS.canada.flag} Montreal : {labels.montreal}
												</span>
												<span>
													{USERS.france.flag} Grenoble : {labels.grenoble}
												</span>
											</li>
										);
									})}
								</ul>
							)}
						</section>

						<section className="availability-panel">
							<h3>Blocs du jour</h3>
							{dayEvents.length === 0 ? (
								<p>Aucun bloc pour cette journee.</p>
							) : (
								<ul>
									{dayEvents.map((event) => (
										<li key={event.id}>
											<span>{event.title}</span>
											<span>
												{USERS.canada.flag} Montreal : {formatRangeInZone(event.startUTC, event.endUTC, USERS.canada.zone)}
											</span>
											<span>
												{USERS.france.flag} Grenoble : {formatRangeInZone(event.startUTC, event.endUTC, USERS.france.zone)}
											</span>
											<div className="mini-actions">
												<button type="button" className="link-btn" onClick={() => setActiveEvent(event)}>
													Selectionner
												</button>
												<button type="button" className="link-btn" onClick={() => handleEdit(event)}>
													Modifier
												</button>
												<button type="button" className="link-btn link-btn--danger" onClick={() => handleDeleteEvent(event.id)}>
													Supprimer
												</button>
											</div>
										</li>
									))}
								</ul>
							)}
						</section>
					</aside>
				</div>
			</div>

			{showMobileEventOverlay ? (
				<div className={`mobile-event-overlay${isMobileOverlayClosing ? " mobile-event-overlay--closing" : ""}`} onClick={handleCloseMobileOverlay} role="presentation">
					<div className="mobile-event-overlay__dialog" onClick={(event) => event.stopPropagation()} role="presentation">
						<EventDetailsPanel
							event={mobileOverlayEvent}
							onEdit={handleEdit}
							onDelete={handleDeleteEvent}
							onTogglePreserve={handleTogglePreserveEvent}
							notificationPreference={activeEventNotificationPref}
							notificationOptions={NOTIFICATION_OPTIONS}
							onToggleNotificationEnabled={handleToggleEventNotifications}
							onToggleNotificationTiming={handleToggleEventNotificationTiming}
							notificationSupported={webPushSupported}
							notificationSupportHint={webPushSupport.message}
							notificationPermission={notificationPermission}
							notificationError={notificationError}
						/>
					</div>
				</div>
			) : null}

			<EventComposerModal
				key={`${selectedDayISO}-${editingEvent?.id || "new"}-${isComposerOpen ? "open" : "closed"}`}
				open={isComposerOpen}
				defaultDayISO={selectedDayISO}
				initialEvent={editingEvent}
				onClose={() => {
					setIsComposerOpen(false);
					setEditingEvent(null);
				}}
				onSave={handleSaveEvent}
				onDelete={handleDeleteEvent}
			/>
		</div>
	);
}
