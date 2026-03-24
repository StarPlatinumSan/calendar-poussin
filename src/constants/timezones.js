export const USERS = {
	canada: {
		id: "canada",
		name: "Andrei",
		person: "Andrei",
		city: "MTL",
		flag: "\uD83C\uDDE8\uD83C\uDDE6",
		zone: "America/Toronto",
		color: "#90e5ff",
	},
	france: {
		id: "france",
		name: "Ninette",
		person: "Ninette",
		city: "GRE",
		flag: "\uD83C\uDDEB\uD83C\uDDF7",
		zone: "Europe/Paris",
		color: "#F58FB2",
	},
	appel: {
		id: "appel",
		name: "Appel",
		person: "Appel",
		city: "",
		flag: "\uD83D\uDFE2",
		zone: "America/Toronto",
		color: "#9fe8b1",
	},
};

export const USER_ORDER = ["canada", "france"];
export const PRIMARY_USER = "canada";
export const PRIMARY_ZONE = USERS[PRIMARY_USER].zone;
