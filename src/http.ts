export class HttpError extends Error {
	readonly status: number;
	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

// Count actual bytes, including chunked requests without Content-Length.
export async function readJson(
	source: Request | Response,
	limit = 65_536,
): Promise<unknown> {
	const reader = source.body?.getReader();
	if (!reader) throw new HttpError(400, "Request body is required.");
	const decoder = new TextDecoder();
	let size = 0;
	let text = "";
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > limit) {
				await reader.cancel();
				throw new HttpError(413, "Request or response is too large.");
			}
			text += decoder.decode(value, { stream: true });
		}
		return JSON.parse(text + decoder.decode());
	} catch (error) {
		if (error instanceof SyntaxError) throw new HttpError(400, "Invalid JSON.");
		throw error;
	} finally {
		reader.releaseLock();
	}
}
