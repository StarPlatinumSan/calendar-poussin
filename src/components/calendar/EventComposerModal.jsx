import { useEffect, useMemo, useState } from "react";
import { USERS } from "../../constants/timezones";
import { formatRangeInZone, getDurationLabel, toLocalDateTimeParts, toUtcIsoFromLocal } from "../../utils/dateTime";

function buildInitialForm(defaultDayISO, initialEvent) {
	if (initialEvent) {
		const sourceZone = USERS[initialEvent.createdBy].zone;
		const startParts = toLocalDateTimeParts(initialEvent.startUTC, sourceZone);
		const endParts = toLocalDateTimeParts(initialEvent.endUTC, sourceZone);

		return {
			title: initialEvent.title || "Indisponible",
			createdBy: initialEvent.createdBy,
			dateISO: startParts.dayISO,
			startTime: startParts.timeHHmm,
			endTime: endParts.timeHHmm,
		};
	}

	return {
		title: "Indisponible",
		createdBy: "canada",
		dateISO: defaultDayISO,
		startTime: "09:00",
		endTime: "10:00",
	};
}

export default function EventComposerModal({ open, defaultDayISO, initialEvent, onClose, onSave, onDelete }) {
	const [form, setForm] = useState(() => buildInitialForm(defaultDayISO, initialEvent));
	const [error, setError] = useState("");
	const isEditMode = Boolean(initialEvent);

	useEffect(() => {
		if (open) {
			setForm(buildInitialForm(defaultDayISO, initialEvent));
			setError("");
		}
	}, [open, defaultDayISO, initialEvent]);

	const preview = useMemo(() => {
		if (!open) {
			return null;
		}

		const sourceZone = USERS[form.createdBy].zone;
		const startUTC = toUtcIsoFromLocal(form.dateISO, form.startTime, sourceZone);
		const endUTC = toUtcIsoFromLocal(form.dateISO, form.endTime, sourceZone);

		if (!startUTC || !endUTC) {
			return null;
		}

		return {
			startUTC,
			endUTC,
		};
	}, [form.createdBy, form.dateISO, form.endTime, form.startTime, open]);

	if (!open) {
		return null;
	}

	const handleSubmit = (event) => {
		event.preventDefault();
		setError("");

		const sourceZone = USERS[form.createdBy].zone;
		const startUTC = toUtcIsoFromLocal(form.dateISO, form.startTime, sourceZone);
		const endUTC = toUtcIsoFromLocal(form.dateISO, form.endTime, sourceZone);

		if (!startUTC || !endUTC) {
			setError("Entre une date et des heures valides.");
			return;
		}

		if (new Date(endUTC) <= new Date(startUTC)) {
			setError("L'heure de fin doit être après le début.");
			return;
		}

		onSave({
			id: initialEvent?.id ?? crypto.randomUUID(),
			title: form.title.trim() || "Indisponible",
			createdBy: form.createdBy,
			startUTC,
			endUTC,
		});
	};

	const handleDelete = () => {
		if (!initialEvent) {
			return;
		}

		onDelete(initialEvent.id);
	};

	return (
		<div className="modal-backdrop" onClick={onClose} role="presentation">
			<div className="modal" onClick={(event) => event.stopPropagation()}>
				<h2>{isEditMode ? "Modifier le bloc" : "Ajouter une indisponibilité"}</h2>
				<form onSubmit={handleSubmit} className="event-form">
					<label>
						Titre
						<input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Rendez-vous, sport, famille..." />
					</label>

					<label>
						Créé par
						<select value={form.createdBy} onChange={(event) => setForm((current) => ({ ...current, createdBy: event.target.value }))}>
							<option value="canada">
								{USERS.canada.flag} {USERS.canada.person}
							</option>
							<option value="france">
								{USERS.france.flag} {USERS.france.person}
							</option>
						</select>
					</label>

					<div className="event-form__split">
						<label>
							Date
							<input type="date" value={form.dateISO} onChange={(event) => setForm((current) => ({ ...current, dateISO: event.target.value }))} />
						</label>
						<label>
							Début
							<input type="time" value={form.startTime} onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))} />
						</label>
						<label>
							Fin
							<input type="time" value={form.endTime} onChange={(event) => setForm((current) => ({ ...current, endTime: event.target.value }))} />
						</label>
					</div>

					{preview ? (
						<div className="event-preview">
							<strong>Aperçu</strong>
							<p>
								{USERS.canada.flag} Montréal : {formatRangeInZone(preview.startUTC, preview.endUTC, USERS.canada.zone)}
							</p>
							<p>
								{USERS.france.flag} Grenoble : {formatRangeInZone(preview.startUTC, preview.endUTC, USERS.france.zone)}
							</p>
							<p>Durée : {getDurationLabel(preview.startUTC, preview.endUTC)}</p>
						</div>
					) : null}

					{error ? <p className="event-form__error">{error}</p> : null}

					<div className="event-form__actions">
						{isEditMode ? (
							<button type="button" className="danger-btn" onClick={handleDelete}>
								Supprimer
							</button>
						) : null}
						<button type="button" className="secondary-btn" onClick={onClose}>
							Annuler
						</button>
						<button type="submit" className="primary-btn">
							Enregistrer
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
