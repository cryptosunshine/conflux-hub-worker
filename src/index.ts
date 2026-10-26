import { answer, parseMessages } from "./chat.ts";
import { HttpError, readJson } from "./http.ts";

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const origin = request.headers.get("Origin");
		const headers = new Headers({
			"Cache-Control": "no-store",
			Vary: "Origin",
		});
		const json = (body: unknown, status = 200) =>
			Response.json(body, { status, headers });
		if (origin) {
			if (
				!env.ALLOWED_ORIGINS.split(",")
					.map((value) => value.trim())
					.includes(origin)
			) {
				return json({ error: "Origin not allowed." }, 403);
			}
			headers.set("Access-Control-Allow-Origin", origin);
			headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
			headers.set("Access-Control-Allow-Headers", "Content-Type");
		}
		if (request.method === "OPTIONS")
			return new Response(null, { status: 204, headers });
		const path = new URL(request.url).pathname;
		if (path === "/api/copilot/health" && request.method === "GET")
			return json({ ok: true });
		if (path !== "/api/copilot/chat") return json({ error: "Not found." }, 404);
		if (request.method !== "POST") return json({ error: "Use POST." }, 405);
		if (!request.headers.get("Content-Type")?.includes("application/json"))
			return json({ error: "Use application/json." }, 415);
		try {
			const messages = parseMessages(await readJson(request));
			return json(await answer(messages, env, request.signal));
		} catch (error) {
			if (error instanceof HttpError)
				return json({ error: error.message }, error.status);
			if (
				error instanceof Error &&
				["TimeoutError", "AbortError"].includes(error.name)
			) {
				return json(
					{ error: "The request was interrupted or timed out. Please retry." },
					504,
				);
			}
			console.error(
				JSON.stringify({
					event: "copilot_request_failed",
					name: error instanceof Error ? error.name : "UnknownError",
				}),
			);
			return json({ error: "Unable to answer right now. Please retry." }, 502);
		}
	},
};
