export type DashboardArgs = {
	cwd: string;
	refresh: boolean;
	avatar: boolean;
	images: boolean;
	interactive: boolean;
};

export function parseDashboardArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): { ok: true; value: DashboardArgs } | { ok: false; error: string } {
	let cwd = env.PWD || process.cwd();
	let refresh = false;
	let avatar = true;
	let images = env.MEKANN_DASHBOARD_IMAGES !== "0";
	let interactive = env.MEKANN_DASHBOARD_INTERACTIVE === "1";

	for (let index = 0; index < argv.length; index++) {
		const token = argv[index];
		if (token === "--cwd") {
			const value = argv[index + 1];
			if (!value) return { ok: false, error: "Usage: mekann-dashboard [--cwd path] [--refresh] [--no-avatar]" };
			cwd = value;
			index += 1;
			continue;
		}
		if (token === "--refresh") {
			refresh = true;
			continue;
		}
		if (token === "--no-avatar") {
			avatar = false;
			continue;
		}
		if (token === "--no-images") {
			images = false;
			avatar = false;
			continue;
		}
		if (token === "--interactive") {
			interactive = true;
			continue;
		}
		if (token === "--text") {
			interactive = false;
			images = false;
			avatar = false;
			continue;
		}
		if (token === "--help" || token === "-h") {
			return { ok: false, error: "Usage: mekann-dashboard [--cwd path] [--refresh] [--no-avatar] [--no-images] [--interactive|--text]" };
		}
		return { ok: false, error: `Unknown option: ${token}` };
	}

	return { ok: true, value: { cwd, refresh, avatar, images, interactive } };
}
