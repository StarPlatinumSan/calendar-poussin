import { useEffect, useMemo, useState } from "react";
import { USERS } from "../../constants/timezones";
import { formatRangeInZone, getDurationLabel, toLocalDateTimeParts, toUtcIsoFromLocal } from "../../utils/dateTime";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function getSourceZone(createdBy) {
	return USERS[createdBy]?.zone || USERS.canada.zone;
}

function parsePastedDates(rawText) {
	const tokens = rawText
		.split(/[\s,;,]+/)
		.map((token) => token.trim())
		.filter(Boolean);
	const uniqueDates = [];
	const seenDates = new Set();

	for (const token of tokens) {
		if (!ISO_DATE_PATTERN.test(token)) {
			return { dates: [], invalidToken: token };
		}

		if (!seenDates.has(token)) {
			seenDates.add(token);
			uniqueDates.push(token);
		}
	}

	return { dates: uniqueDates, invalidToken: null };
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
			pastedDates: "",
		};
	}

	return {
		title: "Indisponible",
		createdBy: "canada",
		dateISO: defaultDayISO,
		startTime: "09:00",
		endTime: "10:00",
		pastedDates: "",
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
		const pasted = parsePastedDates(form.pastedDates || "");
		if (pasted.invalidToken) {
			setError(`Date invalide: "${pasted.invalidToken}". Format attendu: YYYY-MM-DD.`);
			return;
		}

		const targetDates = isEditMode ? [form.dateISO] : Array.from(new Set([form.dateISO, ...pasted.dates]));
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
				setError("L'heure de fin doit etre apres le debut.");
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
						<label>
							Dates supplementaires (copier-coller)
							<textarea
								value={form.pastedDates}
								onChange={(event) => setForm((current) => ({ ...current, pastedDates: event.target.value }))}
								placeholder={"2026-06-02\n2026-06-09\n2026-06-16"}
								rows={4}
							/>
							<small className="event-form__hint">Une date par ligne (ou separees par espace/virgule). Le meme bloc sera cree sur toutes ces dates.</small>
						</label>
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
