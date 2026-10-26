import {
	getSuggestions,
	systemPrompt,
	type Message,
} from "./knowledge.ts";
import { HttpError, readJson } from "./http.ts";

export function parseMessages(body: unknown): Message[] {
	const messages = (body as { messages?: unknown })?.messages;
	if (!Array.isArray(messages) || messages.length === 0) {
		throw new HttpError(400, "Send at least one message.");
	}
	const valid = messages.every(
		(m) =>
			m &&
			(m.role === "user" || m.role === "assistant") &&
			typeof m.content === "string" &&
			m.content.trim() &&
			m.content.length <= (m.role === "user" ? 1000 : 12000),
	);
	if (!valid || messages.at(-1).role !== "user") {
		throw new HttpError(
			400,
			"Invalid messages. Questions must contain 1–1,000 characters and the last message must be from the user.",
		);
	}
	return messages.map(({ role, content }) => ({
		role,
		content: content.trim(),
	}));
}

export async function answer(
	messages: Message[],
	env: Env,
	signal: AbortSignal,
) {
	if (!env.LLM_BASE_URL || !env.LLM_MODEL || !env.LLM_API_KEY) {
		throw new HttpError(
			503,
			"模型服务尚未配置。请在后端 .dev.vars 中填写 LLM_BASE_URL、LLM_MODEL 和 LLM_API_KEY，再重试。",
		);
	}
	// No provider SDK: one server-side, OpenAI-compatible Chat Completions request.
	const response = await fetch(
		`${env.LLM_BASE_URL.replace(/\/$/, "")}/chat/completions`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${env.LLM_API_KEY}`,
			},
			body: JSON.stringify({
				model: env.LLM_MODEL,
				messages: [{ role: "system", content: systemPrompt }, ...messages],
				max_tokens: 1800,
			}),
			signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
		},
	);
	if (!response.ok) {
		await response.body?.cancel();
		throw new HttpError(502, "The model service is unavailable. Please retry.");
	}
	const data = (await readJson(response)) as {
		choices?: { finish_reason?: string; message?: { content?: unknown } }[];
	};
	const choice = data.choices?.[0];
	if (choice?.finish_reason === "length") {
		throw new HttpError(
			502,
			"回答超出模型长度限制，未能完整生成。请缩小问题范围后重试。",
		);
	}
	if (choice?.finish_reason && choice.finish_reason !== "stop") {
		throw new HttpError(
			502,
			"The model did not complete the answer. Please rephrase your question.",
		);
	}
	const reply = choice?.message?.content;
	if (typeof reply !== "string" || !reply.trim() || reply.length > 12000) {
		throw new HttpError(
			502,
			"The model returned an invalid answer. Please retry.",
		);
	}
	return { reply, suggestions: getSuggestions(messages.at(-1)!.content) };
}
