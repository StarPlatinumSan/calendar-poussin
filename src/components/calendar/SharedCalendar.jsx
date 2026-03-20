import { useEffect, useMemo, useState } from "react";
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

const DEFAULT_DAY = DateTime.now().setZone(PRIMARY_ZONE).toISODate();
const configuredApiBaseUrl = (import.meta.env.VITE_API_URL || "").trim();
const isConfiguredApiLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(configuredApiBaseUrl);
const API_BASE_URL = import.meta.env.DEV ? configuredApiBaseUrl || "http://localhost:4000" : isConfiguredApiLocalhost ? "" : configuredApiBaseUrl;

async function apiFetch(path, { method = "GET", body } = {}) {
	const response = await fetch(`${API_BASE_URL}${path}`, {
		method,
		credentials: "include",
		headers: body ? { "Content-Type": "application/json" } : undefined,
		body: body ? JSON.stringify(body) : undefined,
	});

	if (!response.ok) {
		throw new Error(`Request failed: ${response.status}`);
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
	const isMobile = useIsMobile(900);

	useEffect(() => {
		let isMounted = true;

		const loadEvents = async () => {
			try {
				const payload = await apiFetch("/api/events");
				if (!isMounted) {
					return;
				}

				setEvents(Array.isArray(payload?.events) ? payload.events : []);
			} catch {
				if (isMounted) {
					setEvents([]);
				}
			}
		};

		loadEvents();

		return () => {
			isMounted = false;
		};
	}, []);

	const sharedFreeWindows = useMemo(() => getSharedFreeWindows(events, selectedDayISO, PRIMARY_ZONE), [events, selectedDayISO]);

	const dayEvents = useMemo(() => eventsForDay(events, selectedDayISO, PRIMARY_ZONE), [events, selectedDayISO]);

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
		setActiveEvent((current) => (current?.id === eventId ? null : current));
		setEditingEvent((current) => (current?.id === eventId ? null : current));
		setIsComposerOpen(false);
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
		setSelectedDayISO(DEFAULT_DAY);
		setMonthCursor(DateTime.fromISO(DEFAULT_DAY, { zone: PRIMARY_ZONE }).startOf("month"));
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

	const isDayLocked = !isMobile && isDesktopDayLocked;

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
								hintText={isMobile ? "Glisse à gauche/droite pour changer de jour" : "Vue verrouillée heure par heure"}
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
						<EventDetailsPanel event={activeEvent} onEdit={handleEdit} onDelete={handleDeleteEvent} />

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
													{USERS.canada.flag} Montréal : {labels.montreal}
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
								<p>Aucun bloc pour cette journée.</p>
							) : (
								<ul>
									{dayEvents.map((event) => (
										<li key={event.id}>
											<span>{event.title}</span>
											<span>
												{USERS.canada.flag} Montréal : {formatRangeInZone(event.startUTC, event.endUTC, USERS.canada.zone)}
											</span>
											<span>
												{USERS.france.flag} Grenoble : {formatRangeInZone(event.startUTC, event.endUTC, USERS.france.zone)}
											</span>
											<div className="mini-actions">
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
