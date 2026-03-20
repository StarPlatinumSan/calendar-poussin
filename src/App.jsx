import { useCallback, useEffect, useState } from "react";
import SharedCalendar from "./components/calendar/SharedCalendar";
import "./App.css";

const configuredApiBaseUrl = (import.meta.env.VITE_API_URL || "").trim();
const isConfiguredApiLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(configuredApiBaseUrl);
const API_BASE_URL = import.meta.env.DEV ? configuredApiBaseUrl || "http://localhost:4000" : isConfiguredApiLocalhost ? "" : configuredApiBaseUrl;

function App() {
	const [authStatus, setAuthStatus] = useState("loading");
	const [user, setUser] = useState(null);
	const authServerLabel = API_BASE_URL || window.location.origin;

	const checkAuth = useCallback(async () => {
		try {
			const response = await fetch(`${API_BASE_URL}/auth/user`, {
				credentials: "include",
			});

			if (!response.ok) {
				setUser(null);
				setAuthStatus(response.status === 401 ? "guest" : "error");
				return;
			}

			const payload = await response.json();
			setUser(payload.user);
			setAuthStatus("authenticated");
		} catch {
			setUser(null);
			setAuthStatus("error");
		}
	}, []);

	useEffect(() => {
		checkAuth();
	}, [checkAuth]);

	const handleLogin = () => {
		window.location.href = `${API_BASE_URL}/auth/google`;
	};

	const handleLogout = async () => {
		try {
			await fetch(`${API_BASE_URL}/auth/logout`, {
				method: "POST",
				credentials: "include",
			});
		} finally {
			setUser(null);
			setAuthStatus("guest");
		}
	};

	if (authStatus === "loading") {
		return (
			<div className="auth-screen">
				<div className="auth-card">
					<p className="auth-card__label">calendar</p>
					<h1>Vérification de la session Google...</h1>
				</div>
			</div>
		);
	}

	if (authStatus !== "authenticated") {
		return (
			<div className="auth-screen">
				<div className="auth-card">
					<p className="auth-card__label">Planning à deux</p>
					<h1>Ouvrir le calendrier</h1>
					<p>Connecte-toi avec Google pour voir rapidement les horaires de Montréal et la France sur le même calendrier.</p>
					<button type="button" className="primary-btn" onClick={handleLogin}>
						Continuer avec Google
					</button>
					{authStatus === "error" ? <p className="auth-card__error">Impossible de joindre le serveur d’authentification : {authServerLabel}</p> : null}
				</div>
			</div>
		);
	}

	return <SharedCalendar user={user} onLogout={handleLogout} />;
}

export default App;
