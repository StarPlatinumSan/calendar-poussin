import { useEffect, useState } from "react";
import { DateTime } from "luxon";
import { USER_ORDER, USERS } from "../../constants/timezones";
import { formatMonthLabel, getDifferenceLabel, getOffsetLabel } from "../../utils/dateTime";

function TimezonePill({ userId, now }) {
	const profile = USERS[userId];
	const currentTime = now.setZone(profile.zone).toFormat("HH:mm");
	const offset = getOffsetLabel(profile.zone, now);

	return (
		<div className="timezone-pill">
			<span>
				{profile.flag} {profile.person}
			</span>
			<span className="timezone-pill__offset">({offset})</span>
			<span className="timezone-pill__line">Maintenant : {currentTime}</span>
		</div>
	);
}

export default function CalendarHeader({ isMobile, isDayLocked, monthCursor, selectedDayISO, onPrevious, onNext, onToday, onCreate, onUnlockDay, user, onLogout }) {
	const [now, setNow] = useState(() => DateTime.now());

	useEffect(() => {
		const intervalId = window.setInterval(() => {
			setNow(DateTime.now());
		}, 30000);

		return () => window.clearInterval(intervalId);
	}, []);

	const activeLabel = isMobile || isDayLocked ? DateTime.fromISO(selectedDayISO, { zone: USERS.canada.zone }).setLocale("fr").toFormat("cccc d LLLL") : formatMonthLabel(monthCursor);

	const differenceLabel = getDifferenceLabel(USERS.canada.zone, USERS.france.zone, now);

	return (
		<header className="calendar-header">
			<div className="calendar-header__row">
				<div>
					<p className="calendar-header__eyebrow">Notre planning perso</p>
					<h1>{activeLabel}</h1>
				</div>
				<div className="calendar-header__actions">
					<button type="button" className="secondary-btn" onClick={onToday}>
						Aujourd’hui
					</button>
					<button type="button" className="primary-btn" onClick={onCreate}>
						Ajouter un bloc
					</button>
				</div>
			</div>

			<div className="calendar-header__row calendar-header__row--meta">
				<div className="timezone-strip">
					{USER_ORDER.map((userId) => (
						<TimezonePill key={userId} userId={userId} now={now} />
					))}
				</div>
				<div className="calendar-header__profile">
					{user?.photo ? <img src={user.photo} alt={user.displayName} className="profile-photo" /> : <div className="profile-photo profile-photo--fallback">{(user?.displayName || "U").slice(0, 1)}</div>}
					<div>
						<p className="profile-name">{user?.displayName || "Utilisateur Google"}</p>
						<button type="button" className="link-btn" onClick={onLogout}>
							Se déconnecter
						</button>
					</div>
				</div>
			</div>

			<div className="calendar-nav">
				<div className="calendar-nav__left">
					{isDayLocked ? (
						<button type="button" className="secondary-btn calendar-nav__month-btn" onClick={onUnlockDay}>
							Retour au mois
						</button>
					) : null}
					<button type="button" className="icon-btn" onClick={() => onPrevious()}>
						{"<"}
					</button>
				</div>
				<p>{activeLabel}</p>
				<button type="button" className="icon-btn calendar-nav__next" onClick={() => onNext()}>
					{">"}
				</button>
			</div>
		</header>
	);
}
