import { USERS } from "../../constants/timezones";
import { formatDayLabel, formatDayKeyInZone, formatRangeInZone, getDurationLabel } from "../../utils/dateTime";

const DEFAULT_OWNER = {
	person: "Appel",
	city: "",
};

export default function EventDetailsPanel({ event, onEdit, onDelete, notificationPreference, notificationOptions, onToggleNotificationEnabled, onToggleNotificationTiming, notificationSupported, notificationPermission, notificationError }) {
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
	const isNotificationEnabled = Boolean(notificationPreference?.enabled);

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
			<section className="details-panel__notifications">
				<h4>Rappels</h4>
				{!notificationSupported ? (
					<p>Les notifications ne sont pas disponibles dans ce navigateur.</p>
				) : (
					<>
						{!isNotificationEnabled ? (
							<button type="button" className="primary-btn details-panel__notify-btn" onClick={() => onToggleNotificationEnabled(event.id, true)}>
								<strong>Recevoir la notification</strong>
							</button>
						) : (
							<>
								<button type="button" className="secondary-btn details-panel__notify-btn" onClick={() => onToggleNotificationEnabled(event.id, false)}>
									Ne plus recevoir la notification
								</button>
								<div className="details-panel__notification-options">
									{notificationOptions.map((option) => (
										<label key={option.id} className="details-panel__checkbox">
											<input type="checkbox" checked={Boolean(notificationPreference?.timings?.includes(option.id))} onChange={(changeEvent) => onToggleNotificationTiming(event.id, option.id, changeEvent.target.checked)} />
											{option.label}
										</label>
									))}
								</div>
							</>
						)}
						{notificationPermission === "denied" ? <p>Permission refusee. Autorise les notifications dans ton navigateur.</p> : null}
						{notificationError ? <p>{notificationError}</p> : null}
					</>
				)}
			</section>
		</aside>
	);
}
