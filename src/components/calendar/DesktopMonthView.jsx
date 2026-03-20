import { DateTime } from "luxon";
import { PRIMARY_ZONE, USERS } from "../../constants/timezones";
import { buildMonthMatrix, formatDayKeyInZone, formatRangeInZone } from "../../utils/dateTime";

const WEEK_DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export default function DesktopMonthView({ monthCursor, selectedDayISO, events, onLockDay, onOpenCreateForDay, onSelectEvent }) {
	const monthMatrix = buildMonthMatrix(monthCursor);
	const monthKey = monthCursor.toFormat("yyyy-LL");
	const todayStart = DateTime.now().setZone(PRIMARY_ZONE).startOf("day");
	const eventsByDay = events.reduce((accumulator, event) => {
		const dayKey = formatDayKeyInZone(event.startUTC, PRIMARY_ZONE);
		const dayEvents = accumulator[dayKey] || [];
		return {
			...accumulator,
			[dayKey]: [...dayEvents, event],
		};
	}, {});

	return (
		<section className="month-view">
			<div className="month-grid month-grid--head">
				{WEEK_DAYS.map((weekday) => (
					<p key={weekday}>{weekday}</p>
				))}
			</div>
			<div className="month-grid month-grid--body">
				{monthMatrix.flat().map((day) => {
					const dayISO = day.toISODate();
					const dayEvents = (eventsByDay[dayISO] || []).sort((left, right) => left.startUTC.localeCompare(right.startUTC));
					const outsideMonth = day.toFormat("yyyy-LL") !== monthKey;
					const isSelected = selectedDayISO === dayISO;
					const isPastDay = day.startOf("day").toMillis() < todayStart.toMillis();
					const isToday = day.hasSame(todayStart, "day");

					return (
						<article key={dayISO} className={`day-cell${outsideMonth ? " day-cell--outside" : ""}${isSelected ? " day-cell--selected" : ""}${isPastDay ? " day-cell--past" : ""}${isToday ? " day-cell--today" : ""}`} onClick={() => onLockDay(dayISO)}>
							<div className="day-cell__header">
								<span>{day.day}</span>
								<button
									type="button"
									className="day-cell__add"
									onClick={(event) => {
										event.stopPropagation();
										onOpenCreateForDay(dayISO);
									}}
									aria-label={`Ajouter un événement le ${dayISO}`}
								>
									+
								</button>
							</div>
							<div className="day-cell__events">
								{dayEvents.slice(0, 3).map((event) => {
									return (
										<button
											key={event.id}
											type="button"
											className={`event-chip event-chip--${event.createdBy}`}
											onClick={(clickEvent) => {
												clickEvent.stopPropagation();
												onSelectEvent(event);
											}}
										>
											<span>{event.title}</span>

											<small>
												{USERS.canada.flag} Montréal : {formatRangeInZone(event.startUTC, event.endUTC, USERS.canada.zone)}
											</small>
											<small>
												{USERS.france.flag} Grenoble : {formatRangeInZone(event.startUTC, event.endUTC, USERS.france.zone)}
											</small>
										</button>
									);
								})}
								{dayEvents.length > 3 ? <p className="day-cell__more">+{dayEvents.length - 3} autres</p> : null}
							</div>
						</article>
					);
				})}
			</div>
		</section>
	);
}
