import { useEffect, useRef, useState } from "react";
import { PRIMARY_ZONE, USERS } from "../../constants/timezones";
import { clipEventToDay, eventsForDay, formatRangeInZone } from "../../utils/dateTime";

const HOURS = Array.from({ length: 24 }, (_value, index) => index);
const SWIPE_THRESHOLD_PX = 90;
const SWIPE_HORIZONTAL_RATIO = 1.2;
const TIMELINE_EVENT_LEFT_PX = 44;
const TIMELINE_EVENT_RIGHT_PX = 10;

function assignEventLanes(eventsWithPosition) {
	const sorted = [...eventsWithPosition]
		.filter((event) => event.position)
		.sort((left, right) => left.position.startMinute - right.position.startMinute || left.position.endMinute - right.position.endMinute);
	const laneAssignments = new Map();
	let index = 0;

	while (index < sorted.length) {
		const cluster = [sorted[index]];
		let clusterEnd = sorted[index].position.endMinute;
		index += 1;

		while (index < sorted.length && sorted[index].position.startMinute < clusterEnd) {
			cluster.push(sorted[index]);
			clusterEnd = Math.max(clusterEnd, sorted[index].position.endMinute);
			index += 1;
		}

		const laneEndMinutes = [];
		for (const event of cluster) {
			let laneIndex = laneEndMinutes.findIndex((laneEndMinute) => laneEndMinute <= event.position.startMinute);
			if (laneIndex === -1) {
				laneEndMinutes.push(event.position.endMinute);
				laneIndex = laneEndMinutes.length - 1;
			} else {
				laneEndMinutes[laneIndex] = event.position.endMinute;
			}
			laneAssignments.set(event.id, laneIndex);
		}

		const laneCount = Math.max(laneEndMinutes.length, 1);
		for (const event of cluster) {
			const laneIndex = laneAssignments.get(event.id) ?? 0;
			laneAssignments.set(event.id, { laneIndex, laneCount });
		}
	}

	return eventsWithPosition.map((event) => ({
		...event,
		...(laneAssignments.get(event.id) || { laneIndex: 0, laneCount: 1 }),
	}));
}

export default function MobileDayView({
	dayISO,
	events,
	sharedFreeWindows,
	onShiftDay,
	onSelectEvent,
	onOpenCreateForDay,
	enableSwipe = true,
	hintText = "Glisse à gauche/droite pour changer de jour",
}) {
	const touchStartRef = useRef(null);
	const swipeDirectionRef = useRef(0);
	const animationTimeoutRef = useRef(null);
	const [transitionClass, setTransitionClass] = useState("");

	const dayEvents = eventsForDay(events, dayISO, PRIMARY_ZONE).map((event) => ({
		...event,
		position: clipEventToDay(event, dayISO, PRIMARY_ZONE),
	}));
	const laidOutDayEvents = assignEventLanes(dayEvents);

	useEffect(() => {
		if (!swipeDirectionRef.current) {
			return undefined;
		}

		const nextTransitionClass = swipeDirectionRef.current > 0 ? "mobile-day--enter-next" : "mobile-day--enter-prev";
		setTransitionClass(nextTransitionClass);
		swipeDirectionRef.current = 0;

		window.clearTimeout(animationTimeoutRef.current);
		animationTimeoutRef.current = window.setTimeout(() => {
			setTransitionClass("");
		}, 240);

		return () => {
			window.clearTimeout(animationTimeoutRef.current);
		};
	}, [dayISO]);

	useEffect(() => {
		return () => {
			window.clearTimeout(animationTimeoutRef.current);
		};
	}, []);

	const handleTouchStart = (event) => {
		touchStartRef.current = {
			x: event.changedTouches[0].clientX,
			y: event.changedTouches[0].clientY,
		};
	};

	const handleTouchEnd = (event) => {
		if (!enableSwipe) {
			return;
		}

		if (touchStartRef.current === null) {
			return;
		}

		const deltaX = event.changedTouches[0].clientX - touchStartRef.current.x;
		const deltaY = event.changedTouches[0].clientY - touchStartRef.current.y;
		touchStartRef.current = null;

		if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX) {
			return;
		}

		if (Math.abs(deltaX) < Math.abs(deltaY) * SWIPE_HORIZONTAL_RATIO) {
			return;
		}

		const direction = deltaX > 0 ? -1 : 1;
		swipeDirectionRef.current = direction;
		onShiftDay(direction);
	};

	return (
		<section className={`mobile-day ${transitionClass}`.trim()} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
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

				{laidOutDayEvents.map((event) => {
					if (!event.position) {
						return null;
					}

					const top = (event.position.startMinute / 1440) * 100;
					const height = Math.max(((event.position.endMinute - event.position.startMinute) / 1440) * 100, 3);
					const timelineContentWidth = `100% - ${TIMELINE_EVENT_LEFT_PX + TIMELINE_EVENT_RIGHT_PX}px`;
					const width = `calc((${timelineContentWidth}) / ${event.laneCount})`;
					const left = `calc(${TIMELINE_EVENT_LEFT_PX}px + ((${timelineContentWidth}) / ${event.laneCount}) * ${event.laneIndex})`;

					return (
						<button
							key={event.id}
							type="button"
							className={`timeline-event timeline-event--${event.createdBy}`}
							style={{
								top: `${top}%`,
								height: `${height}%`,
								left,
								width,
								right: "auto",
								zIndex: event.laneIndex + 1,
							}}
							onClick={() => onSelectEvent(event)}
						>
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
