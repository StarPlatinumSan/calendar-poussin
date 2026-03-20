import { useRef } from "react";
import { PRIMARY_ZONE, USERS } from "../../constants/timezones";
import { clipEventToDay, eventsForDay, formatRangeInZone } from "../../utils/dateTime";

const HOURS = Array.from({ length: 24 }, (_value, index) => index);

export default function MobileDayView({ dayISO, events, sharedFreeWindows, onShiftDay, onSelectEvent, onOpenCreateForDay, enableSwipe = true, hintText = "Glisse à gauche/droite pour changer de jour" }) {
	const touchStartRef = useRef(null);

	const dayEvents = eventsForDay(events, dayISO, PRIMARY_ZONE).map((event) => ({
		...event,
		position: clipEventToDay(event, dayISO, PRIMARY_ZONE),
	}));

	const handleTouchStart = (event) => {
		touchStartRef.current = event.changedTouches[0].clientX;
	};

	const handleTouchEnd = (event) => {
		if (!enableSwipe) {
			return;
		}

		if (touchStartRef.current === null) {
			return;
		}

		const deltaX = event.changedTouches[0].clientX - touchStartRef.current;
		touchStartRef.current = null;

		if (Math.abs(deltaX) < 55) {
			return;
		}

		onShiftDay(deltaX > 0 ? -1 : 1);
	};

	return (
		<section className="mobile-day" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
			<button type="button" className="mobile-add-btn" onClick={() => onOpenCreateForDay(dayISO)}>
				Ajouter un bloc
			</button>
			{hintText ? <div className="mobile-hint">{hintText}</div> : null}
			<div className="timeline">
				{HOURS.map((hour) => (
					<div key={hour} className="timeline__hour">
						<span>{`${String(hour).padStart(2, "0")}:00`}</span>
					</div>
				))}

				{sharedFreeWindows.map(([startMinute, endMinute]) => (
					<div
						key={`${startMinute}-${endMinute}`}
						className="timeline__free-window"
						style={{
							top: `${(startMinute / 1440) * 100}%`,
							height: `${((endMinute - startMinute) / 1440) * 100}%`,
						}}
					/>
				))}

				{dayEvents.map((event) => {
					if (!event.position) {
						return null;
					}

					const top = (event.position.startMinute / 1440) * 100;
					const height = Math.max(((event.position.endMinute - event.position.startMinute) / 1440) * 100, 3);

					return (
						<button key={event.id} type="button" className={`timeline-event timeline-event--${event.createdBy}`} style={{ top: `${top}%`, height: `${height}%` }} onClick={() => onSelectEvent(event)}>
							<strong>{event.title}</strong>
							<small>
								{USERS.canada.flag} Montréal : {formatRangeInZone(event.startUTC, event.endUTC, USERS.canada.zone)}
							</small>
							<small>
								{USERS.france.flag} Grenoble : {formatRangeInZone(event.startUTC, event.endUTC, USERS.france.zone)}
							</small>
						</button>
					);
				})}
			</div>
		</section>
	);
}
