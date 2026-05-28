import { useEffect, useMemo, useState } from "react";
import { USERS } from "../../constants/timezones";
import { formatRangeInZone, getDurationLabel, toLocalDateTimeParts, toUtcIsoFromLocal } from "../../utils/dateTime";

function getSourceZone(createdBy) {
	return USERS[createdBy]?.zone || USERS.canada.zone;
}

function buildInitialForm(defaultDayISO, initialEvent) {
	if (initialEvent) {
		const sourceZone = getSourceZone(initialEvent.createdBy);
		const startParts = toLocalDateTimeParts(initialEvent.startUTC, sourceZone);
		const endParts = toLocalDateTimeParts(initialEvent.endUTC, sourceZone);

		return {
			title: initialEvent.title || (initialEvent.createdBy === "appel" ? "Appel" : "Indisponible"),
			createdBy: initialEvent.createdBy,
			dateISO: startParts.dayISO,
			startTime: startParts.timeHHmm,
			endTime: endParts.timeHHmm,
			extraDates: [],
		};
	}

	return {
		title: "Indisponible",
		createdBy: "canada",
		dateISO: defaultDayISO,
		startTime: "09:00",
		endTime: "10:00",
		extraDates: [],
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

	useEffect(() => {
		if (typeof document === "undefined") {
			return undefined;
		}

		if (!open) {
			document.body.classList.remove("modal-open");
			return undefined;
		}

		document.body.classList.add("modal-open");

		return () => {
			document.body.classList.remove("modal-open");
		};
	}, [open]);

	const preview = useMemo(() => {
		if (!open) {
			return null;
		}

		const sourceZone = getSourceZone(form.createdBy);
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

	const handleSubmit = async (event) => {
		event.preventDefault();
		setError("");

		const sourceZone = getSourceZone(form.createdBy);
		const normalizedTitle = form.createdBy === "appel" ? "Appel" : form.title.trim() || "Indisponible";

		const targetDates = isEditMode ? [form.dateISO] : Array.from(new Set([form.dateISO, ...form.extraDates.filter((item) => typeof item === "string" && item)]));
		if (targetDates.length === 0) {
			setError("Ajoute au moins une date.");
			return;
		}

		const eventsToSave = [];
		for (const dayISO of targetDates) {
			const startUTC = toUtcIsoFromLocal(dayISO, form.startTime, sourceZone);
			const endUTC = toUtcIsoFromLocal(dayISO, form.endTime, sourceZone);

			if (!startUTC || !endUTC) {
				setError(`Date/heure invalide pour ${dayISO}.`);
				return;
			}

			if (new Date(endUTC) <= new Date(startUTC)) {
				setError("L'heure de fin doit être après le début.");
				return;
			}

			eventsToSave.push({
				id: initialEvent?.id ?? crypto.randomUUID(),
				title: normalizedTitle,
				createdBy: form.createdBy,
				startUTC,
				endUTC,
			});
		}

		try {
			await onSave(isEditMode ? eventsToSave[0] : eventsToSave);
		} catch (saveError) {
			setError(saveError?.message || "Impossible d'enregistrer ce bloc.");
		}
	};

	const handleAddExtraDate = () => {
		setForm((current) => ({ ...current, extraDates: [...current.extraDates, current.dateISO] }));
	};

	const handleChangeExtraDate = (index, value) => {
		setForm((current) => ({
			...current,
			extraDates: current.extraDates.map((item, itemIndex) => (itemIndex === index ? value : item)),
		}));
	};

	const handleRemoveExtraDate = (index) => {
		setForm((current) => ({
			...current,
			extraDates: current.extraDates.filter((_, itemIndex) => itemIndex !== index),
		}));
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
						Cree par
						<select
							value={form.createdBy}
							onChange={(event) => {
								const nextCreatedBy = event.target.value;
								setForm((current) => ({
									...current,
									createdBy: nextCreatedBy,
									title: nextCreatedBy === "appel" ? "Appel" : current.title,
								}));
							}}
						>
							<option value="canada">
								{USERS.canada.flag} {USERS.canada.person}
							</option>
							<option value="france">
								{USERS.france.flag} {USERS.france.person}
							</option>
							<option value="appel">Appel</option>
						</select>
					</label>

					<div className="event-form__split">
						<label>
							Date
							<input type="date" value={form.dateISO} onChange={(event) => setForm((current) => ({ ...current, dateISO: event.target.value }))} />
						</label>
						<label>
							Debut
							<input type="time" value={form.startTime} onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))} />
						</label>
						<label>
							Fin
							<input type="time" value={form.endTime} onChange={(event) => setForm((current) => ({ ...current, endTime: event.target.value }))} />
						</label>
					</div>
					{!isEditMode ? (
						<div className="event-form__extra-dates">
							<div className="event-form__extra-dates-header">
								<strong>Autres dates</strong>
								<button type="button" className="secondary-btn" onClick={handleAddExtraDate}>
									Ajouter date
								</button>
							</div>
							{form.extraDates.map((dateValue, index) => (
								<div key={`extra-date-${index}`} className="event-form__extra-date-row">
									<input type="date" value={dateValue} onChange={(event) => handleChangeExtraDate(index, event.target.value)} />
									<button type="button" className="link-btn link-btn--danger" onClick={() => handleRemoveExtraDate(index)}>
										Supprimer
									</button>
								</div>
							))}
						</div>
					) : null}

					{preview ? (
						<div className="event-preview">
							<strong>Apercu</strong>
							<p>
								{USERS.canada.flag} Montreal : {formatRangeInZone(preview.startUTC, preview.endUTC, USERS.canada.zone)}
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
