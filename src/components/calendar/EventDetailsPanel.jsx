import { USERS } from "../../constants/timezones";
import { formatDayLabel, formatDayKeyInZone, formatRangeInZone, getDurationLabel } from "../../utils/dateTime";

const DEFAULT_OWNER = {
	person: "Appel",
	city: "",
};

export default function EventDetailsPanel({ event, onEdit, onDelete }) {
	if (!event) {
		return (
			<aside className="details-panel">
				<h3>Details du bloc</h3>
				<p>Selectionne un evenement pour le modifier ou le supprimer.</p>
			</aside>
		);
	}

	const owner = USERS[event.createdBy] || DEFAULT_OWNER;
	const dayISO = formatDayKeyInZone(event.startUTC, USERS.canada.zone);

	return (
		<aside className="details-panel">
			<h3>{event.title}</h3>
			<p className="details-panel__meta">
				{owner.person} ({owner.city})
			</p>
			<div className="details-panel__rows">
				<p>{formatDayLabel(dayISO, USERS.canada.zone)}</p>
				<p>
					{USERS.canada.flag} Montreal : {formatRangeInZone(event.startUTC, event.endUTC, USERS.canada.zone)}
				</p>
				<p>
					{USERS.france.flag} Grenoble : {formatRangeInZone(event.startUTC, event.endUTC, USERS.france.zone)}
				</p>
				<p>Duree : {getDurationLabel(event.startUTC, event.endUTC)}</p>
			</div>
			<div className="details-panel__actions">
				<button type="button" className="secondary-btn" onClick={() => onEdit(event)}>
					Modifier
				</button>
				<button type="button" className="danger-btn" onClick={() => onDelete(event.id)}>
					Supprimer
				</button>
			</div>
		</aside>
	);
}
