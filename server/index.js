import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import webPush from "web-push";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import eventReminderPreferencesRepository from "./lib/eventReminderPreferencesRepository.js";
import pushSubscriptionsRepository from "./lib/pushSubscriptionsRepository.js";
import reminderDeliveryLogRepository from "./lib/reminderDeliveryLogRepository.js";
import sharedCalendarEventsRepository from "./lib/sharedCalendarEventsRepository.js";
import { startWebPushReminderScheduler, TIMING_OPTIONS } from "./lib/webPushReminderService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, ".env") });

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || (IS_PRODUCTION ? "" : "http://localhost:5173");
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || "";
const DIST_PATH = path.resolve(__dirname, "../dist");
const LOCAL_HOST_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
const IS_LOCAL_PRODUCTION = IS_PRODUCTION && (LOCAL_HOST_PATTERN.test(CLIENT_ORIGIN) || LOCAL_HOST_PATTERN.test(GOOGLE_CALLBACK_URL));
const USE_SECURE_COOKIES = IS_PRODUCTION && !IS_LOCAL_PRODUCTION;
const COOKIE_SAME_SITE = USE_SECURE_COOKIES ? "none" : "lax";
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "";
const HAS_WEB_PUSH_CONFIG = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT);
const ALLOWED_REMINDER_TIMINGS = new Set(TIMING_OPTIONS.map((option) => option.id));

const requiredEnvVars = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_CALLBACK_URL", "SESSION_SECRET", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

const missingEnvVars = requiredEnvVars.filter((name) => !process.env[name]);

if (missingEnvVars.length > 0) {
	console.error(`Missing environment variables: ${missingEnvVars.join(", ")}`);
	process.exit(1);
}

if (HAS_WEB_PUSH_CONFIG) {
	webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
	console.warn("[web-push] disabled: missing VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT");
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

const getCurrentUserId = (req) => req.user?.id || req.user?.email || null;

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

app.get("/api/push/public-key", requireAuth, (_req, res) => {
	if (!HAS_WEB_PUSH_CONFIG) {
		return res.status(503).json({ error: "Web push is not configured" });
	}

	return res.json({ publicKey: VAPID_PUBLIC_KEY });
});

app.post("/api/push/subscribe", requireAuth, async (req, res) => {
	if (!HAS_WEB_PUSH_CONFIG) {
		return res.status(503).json({ error: "Web push is not configured" });
	}

	const userId = getCurrentUserId(req);
	const subscription = req.body?.subscription;

	if (!userId) {
		return res.status(400).json({ error: "Missing authenticated user id" });
	}

	if (!subscription || typeof subscription.endpoint !== "string" || !subscription.endpoint || typeof subscription?.keys?.p256dh !== "string" || !subscription.keys.p256dh || typeof subscription?.keys?.auth !== "string" || !subscription.keys.auth) {
		return res.status(400).json({ error: "Invalid push subscription payload" });
	}

	try {
		await pushSubscriptionsRepository.upsertSubscription(userId, subscription, req.get("user-agent"));

		return res.status(204).send();
	} catch (error) {
		console.error("[api/push/subscribe][POST] failed", JSON.stringify(error, null, 2));
		return res.status(500).json({ error: "Failed to save push subscription" });
	}
});

app.post("/api/push/unsubscribe", requireAuth, async (req, res) => {
	const endpoint = req.body?.endpoint;

	if (typeof endpoint !== "string" || !endpoint) {
		return res.status(400).json({ error: "Missing endpoint" });
	}

	try {
		await pushSubscriptionsRepository.deleteByEndpoint(endpoint);
		return res.status(204).send();
	} catch (error) {
		console.error("[api/push/unsubscribe][POST] failed", JSON.stringify(error, null, 2));
		return res.status(500).json({ error: "Failed to remove push subscription" });
	}
});

app.get("/api/reminders/preferences", requireAuth, async (req, res) => {
	const userId = getCurrentUserId(req);
	if (!userId) {
		return res.status(400).json({ error: "Missing authenticated user id" });
	}

	try {
		const preferences = await eventReminderPreferencesRepository.listByUserId(userId);
		return res.json({ preferences });
	} catch (error) {
		console.error("[api/reminders/preferences][GET] failed", JSON.stringify(error, null, 2));
		return res.status(500).json({ error: "Failed to load reminder preferences" });
	}
});

app.put("/api/reminders/preferences/:eventId", requireAuth, async (req, res) => {
	const userId = getCurrentUserId(req);
	const eventId = req.params.eventId;
	const enabled = Boolean(req.body?.enabled);
	const timings = Array.isArray(req.body?.timings) ? req.body.timings.filter((timingId) => ALLOWED_REMINDER_TIMINGS.has(timingId)) : [];

	if (!userId) {
		return res.status(400).json({ error: "Missing authenticated user id" });
	}

	if (!eventId || typeof eventId !== "string") {
		return res.status(400).json({ error: "Invalid event id" });
	}

	if (enabled && timings.length === 0) {
		return res.status(400).json({ error: "At least one timing is required when reminders are enabled" });
	}

	try {
		const preference = await eventReminderPreferencesRepository.setPreference(userId, eventId, enabled, timings);

		return res.json({ preference });
	} catch (error) {
		console.error("[api/reminders/preferences][PUT] failed", JSON.stringify(error, null, 2));

		if (error?.code || error?.details || error?.hint) {
			return res.status(400).json({
				error: "Reminder preference update failed",
				message: error?.message ?? null,
				code: error?.code ?? null,
				details: error?.details ?? null,
				hint: error?.hint ?? null,
			});
		}

		return res.status(500).json({ error: "Internal server error" });
	}
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

if (HAS_WEB_PUSH_CONFIG) {
	startWebPushReminderScheduler({
		webPush,
		reminderPreferencesRepository: eventReminderPreferencesRepository,
		reminderDeliveryLogRepository,
		sharedCalendarEventsRepository,
		pushSubscriptionsRepository,
			intervalMs: 60 * 1000,
	});
}

app.listen(PORT, () => {
	console.log(`Auth server listening on port ${PORT}`);
});
