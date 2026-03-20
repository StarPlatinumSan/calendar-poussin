import { USERS } from "../../constants/timezones";
import { formatDayLabel, formatDayKeyInZone, formatRangeInZone, getDurationLabel } from "../../utils/dateTime";

export default function EventDetailsPanel({ event, onEdit, onDelete }) {
	if (!event) {
		return (
			<aside className="details-panel">
				<h3>Détails du bloc</h3>
				<p>Sélectionne un événement pour le modifier ou le supprimer.</p>
			</aside>
		);
	}

	const owner = USERS[event.createdBy];
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
					{USERS.canada.flag} Montréal : {formatRangeInZone(event.startUTC, event.endUTC, USERS.canada.zone)}
				</p>
				<p>
					{USERS.france.flag} Grenoble : {formatRangeInZone(event.startUTC, event.endUTC, USERS.france.zone)}
				</p>
				<p>Durée : {getDurationLabel(event.startUTC, event.endUTC)}</p>
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
