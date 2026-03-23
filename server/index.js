import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharedCalendarEventsRepository from "./lib/sharedCalendarEventsRepository.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || (IS_PRODUCTION ? "" : "http://localhost:5173");
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || "";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_PATH = path.resolve(__dirname, "../dist");
const LOCAL_HOST_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
const IS_LOCAL_PRODUCTION = IS_PRODUCTION && (LOCAL_HOST_PATTERN.test(CLIENT_ORIGIN) || LOCAL_HOST_PATTERN.test(GOOGLE_CALLBACK_URL));
const USE_SECURE_COOKIES = IS_PRODUCTION && !IS_LOCAL_PRODUCTION;
const COOKIE_SAME_SITE = USE_SECURE_COOKIES ? "none" : "lax";

const requiredEnvVars = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_CALLBACK_URL", "SESSION_SECRET", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

const missingEnvVars = requiredEnvVars.filter((name) => !process.env[name]);

if (missingEnvVars.length > 0) {
	console.error(`Missing environment variables: ${missingEnvVars.join(", ")}`);
	process.exit(1);
}

if (CLIENT_ORIGIN) {
	app.use(
		cors({
			origin: CLIENT_ORIGIN,
			credentials: true,
		}),
	);
}

app.use(express.json());

if (USE_SECURE_COOKIES) {
	app.set("trust proxy", 1);
}

app.use(
	session({
		secret: process.env.SESSION_SECRET,
		resave: false,
		saveUninitialized: false,
		cookie: {
			httpOnly: true,
			sameSite: COOKIE_SAME_SITE,
			secure: USE_SECURE_COOKIES,
		},
	}),
);

app.use(passport.initialize());
app.use(passport.session());

passport.use(
	new GoogleStrategy(
		{
			clientID: process.env.GOOGLE_CLIENT_ID,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET,
			callbackURL: process.env.GOOGLE_CALLBACK_URL,
		},
		(accessToken, refreshToken, profile, done) => {
			const user = {
				id: profile.id,
				displayName: profile.displayName,
				email: profile.emails?.[0]?.value ?? null,
				photo: profile.photos?.[0]?.value ?? null,
			};

			return done(null, user);
		},
	),
);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

const requireAuth = (req, res, next) => {
	if (!req.isAuthenticated()) {
		return res.status(401).json({ authenticated: false });
	}

	return next();
};

app.get("/health", (_req, res) => {
	res.json({ ok: true });
});

app.get(
	"/auth/google",
	passport.authenticate("google", {
		scope: ["profile", "email"],
	}),
);

app.get(
	"/auth/google/callback",
	passport.authenticate("google", {
		failureRedirect: "/auth/failure",
		session: true,
	}),
	(_req, res) => {
		res.redirect(CLIENT_ORIGIN || "/");
	},
);

app.get("/auth/user", (req, res) => {
	if (!req.isAuthenticated()) {
		return res.status(401).json({ authenticated: false });
	}

	return res.json({ authenticated: true, user: req.user });
});

app.get("/auth/failure", (_req, res) => {
	res.status(401).json({ error: "Google authentication failed" });
});

app.get("/api/events", requireAuth, async (_req, res) => {
	const events = await sharedCalendarEventsRepository.listEvents();
	return res.json({ events });
});

app.post("/api/events", requireAuth, async (req, res) => {
	const { title, startUTC, endUTC, createdBy } = req.body || {};

	if (typeof title !== "string" || !title.trim()) {
		return res.status(400).json({ error: "Invalid title" });
	}

	if (!["canada", "france", "appel"].includes(createdBy)) {
		return res.status(400).json({ error: "Invalid createdBy value" });
	}

	if (typeof startUTC !== "string" || typeof endUTC !== "string" || Number.isNaN(Date.parse(startUTC)) || Number.isNaN(Date.parse(endUTC))) {
		return res.status(400).json({ error: "Invalid startUTC/endUTC values" });
	}

	if (new Date(endUTC).getTime() <= new Date(startUTC).getTime()) {
		return res.status(400).json({ error: "endUTC must be after startUTC" });
	}

	console.info("[api/events][POST] payload", JSON.stringify(req.body, null, 2));

	try {
		const event = await sharedCalendarEventsRepository.createEvent({
			title: title.trim(),
			startUTC,
			endUTC,
			createdBy,
		});

		return res.status(201).json({ event });
	} catch (error) {
		console.error("[api/events][POST] create failed", JSON.stringify(error, null, 2));

		if (error?.code || error?.details || error?.hint) {
			return res.status(400).json({
				error: "Event creation failed",
				message: error?.message ?? null,
				code: error?.code ?? null,
				details: error?.details ?? null,
				hint: error?.hint ?? null,
			});
		}

		return res.status(500).json({ error: "Internal server error" });
	}
});

app.put("/api/events/:id", requireAuth, async (req, res) => {
	const event = await sharedCalendarEventsRepository.updateEvent(req.params.id, req.body || {});

	return res.json({ event });
});

app.delete("/api/events/:id", requireAuth, async (req, res) => {
	await sharedCalendarEventsRepository.deleteEvent(req.params.id);
	return res.status(204).send();
});

app.post("/auth/logout", (req, res, next) => {
	req.logout((logoutError) => {
		if (logoutError) {
			return next(logoutError);
		}

		req.session.destroy((destroyError) => {
			if (destroyError) {
				return next(destroyError);
			}

			res.clearCookie("connect.sid", {
				httpOnly: true,
				sameSite: COOKIE_SAME_SITE,
				secure: USE_SECURE_COOKIES,
			});
			return res.json({ ok: true });
		});
	});
});

if (IS_PRODUCTION && fs.existsSync(DIST_PATH)) {
	app.use(express.static(DIST_PATH));
	app.get(/^\/(?!api|auth|health).*/, (_req, res) => {
		res.sendFile(path.join(DIST_PATH, "index.html"));
	});
}

app.listen(PORT, () => {
	console.log(`Auth server listening on port ${PORT}`);
});
