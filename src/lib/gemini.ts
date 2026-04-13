import { GoogleGenAI } from '@google/genai';
import { GEMINI_API_KEY } from '$env/static/private';
import { safeLog } from './logger';

// Helper to initialize GenAI safely
function getAi() {
	if (!GEMINI_API_KEY || GEMINI_API_KEY.trim() === '') {
		throw new Error('Server configuration error: GEMINI_API_KEY is missing or empty.');
	}
	return new GoogleGenAI({ apiKey: GEMINI_API_KEY });
}

/** 
 * Safely extracts a readable message from potentially complex Gemini error objects.
 */
function extractErrorMessage(error: any): string {
	const rawMsg = error instanceof Error ? error.message : String(error);

	// Check for common quota/rate limit text
	if (rawMsg.includes('quota') || rawMsg.includes('429') || rawMsg.includes('RESOURCE_EXHAUSTED')) {
		return "The AI service is currently at maximum capacity. Switching to a backup model...";
	}

	try {
		const parsed = JSON.parse(rawMsg);
		if (parsed?.error?.message) return parsed.error.message;
		if (parsed?.message) return parsed.message;
	} catch {
		// Not JSON
	}

	return rawMsg.replace(/^\[.*?\]\s*/, '').trim();
}

/**
 * List of available models in preferred order (Speed/Lite -> Flash -> Pro)
 */
const FULL_MODEL_POOL = [
	'gemini-3.1-flash-lite-preview',
	'gemini-3-flash-preview',
	'gemini-2.5-flash',
	'gemini-3.1-pro-preview',
	'gemini-2.5-pro',
	'gemma-4-31b-it'
];

/**
 * Helper to wait for a specific duration (ms)
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Internal helper to run a Gemini operation with a pool of models for fallback.
 */
async function runWithFallback(
	modelPool: string[],
	operation: (modelName: string) => Promise<any>,
	label: string,
	collector?: any[],
	onFallback?: (modelName: string, error: string) => void,
	onAttempt?: (modelName: string) => void
) {
	let lastError: any = null;

	for (const modelName of modelPool) {
		if (onAttempt) onAttempt(modelName);
		try {
			const result = await operation(modelName);
			return { result, modelName };
		} catch (error) {
			lastError = error;
			const msg = extractErrorMessage(error);
			safeLog(`${label}_FALLBACK_TRIGGERED`, { modelAttempted: modelName, error: msg }, collector);
			console.warn(`[GEMINI:FALLBACK] Model ${modelName} failed for ${label}. Error: ${msg}`);

			if (onFallback) {
				onFallback(modelName, msg);
			}

			// ARTIFICIAL DELAY: Let the user read the fallback status in the UI
			await sleep(800);
		}
	}

	throw lastError;
}

/**
 * Condenses chat history and a new message into a single standalone search query.
 */
export async function condenseQuery(
	history: Array<{ role: string; parts: Array<{ text: string }> }>,
	message: string,
	collector?: any[],
	onFallback?: (modelName: string, error: string) => void,
	onAttempt?: (modelName: string) => void
): Promise<{ condensed: string; modelUsed: string }> {
	const ai = getAi();
	const historyText = history
		.slice(-6)
		.map((m) => `${m.role.toUpperCase()}: ${m.parts.map((p) => p.text).join(' ')}`)
		.join('\n');

	const queryPrompt = `HISTORY:\n${historyText}\n\nUSER MESSAGE:\n${message}\n\nSTANDALONE QUERY:`;

	const { result, modelName } = await runWithFallback(
		FULL_MODEL_POOL,
		async (m) => {
			return await ai.models.generateContent({
				model: m,
				config: {
					systemInstruction: 'You are a search query optimizer. Given a chat history and a new user message, rewrite the message into a concise, standalone objective search query that captures all necessary context. Do not answer the question. Only output the search query itself.'
				},
				contents: [{ role: 'user', parts: [{ text: queryPrompt }] }]
			});
		},
		'CONDENSE',
		collector,
		onFallback,
		onAttempt
	);

	const condensed = result.text?.trim() || message;
	safeLog('CONDENSED_QUERY_GENERATED', { original: message, condensed, modelUsed: modelName }, collector);

	return { condensed, modelUsed: modelName };
}

/**
 * Alternative chat function for RAG that injects external context into the final user message.
 */
export async function sendRagChatMessage(
	systemInstruction: string,
	history: Array<{ role: string; parts: Array<{ text: string }> }>,
	message: string,
	contextText: string,
	productGreeting: Array<{ text: string }>,
	collector?: any[],
	onFallback?: (modelName: string, error: string) => void,
	onAttempt?: (modelName: string) => void
): Promise<{ reply: string; modelUsed: string }> {
	const ai = getAi();
	const augmentedMessage = `Context Information from Vector DB:\n---\n${contextText || 'No specific context found in DB.'}\n---\n\nUser Question: ${message}`;

	const { result, modelName } = await runWithFallback(
		FULL_MODEL_POOL,
		async (m) => {
			const chat = ai.chats.create({
				model: m,
				config: { systemInstruction },
				history: [
					{ role: 'model', parts: productGreeting },
					...history
				]
			});
			return await chat.sendMessage({ message: augmentedMessage });
		},
		'RAG_CHAT',
		collector,
		onFallback,
		onAttempt
	);

	const reply = result.text?.trim() || '';
	safeLog('GEMINI_RAG_RESPONSE', { reply, modelUsed: modelName }, collector);

	return { reply, modelUsed: modelName };
}
