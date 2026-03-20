export const USERS = {
	canada: {
		id: "canada",
		name: "Andrei",
		person: "Andrei",
		city: "MTL",
		flag: "🇨🇦",
		zone: "America/Toronto",
		color: "#90e5ff",
	},
	france: {
		id: "france",
		name: "Ninette",
		person: "Ninette",
		city: "GRE",
		flag: "🇫🇷",
		zone: "Europe/Paris",
		color: "#F58FB2",
	},
};

export const USER_ORDER = ["canada", "france"];
export const PRIMARY_USER = "canada";
export const PRIMARY_ZONE = USERS[PRIMARY_USER].zone;
