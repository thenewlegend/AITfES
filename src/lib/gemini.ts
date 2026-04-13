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
    try {
        // Attempt to parse if it's a JSON string from the SDK
        const parsed = JSON.parse(rawMsg);
        if (parsed?.error?.message) return parsed.error.message;
        if (parsed?.message) return parsed.message;
    } catch {
        // Not JSON, continue with regex cleanup
    }
    
    // Fallback: strip common technical prefixes but keep the core message
    return rawMsg.replace(/^\[.*?\]\s*/, '').trim();
}

/**
 * Server-only module — sends a single chat message to Gemini with conversation history.
 *
 * @param systemInstruction - The system prompt for the model.
 * @param history - Prior conversation turns in Gemini Content format.
 * @param message - The new user message to send.
 * @returns The model's reply text.
 */
export async function sendChatMessage(
	systemInstruction: string,
	history: Array<{ role: string; parts: Array<{ text: string }> }>,
	message: string,
	collector?: any[]
): Promise<string> {
	const ai = getAi();

	const chat = ai.chats.create({
		model: 'gemini-2.5-flash',
		config: {
			systemInstruction: systemInstruction,
			tools: [{ googleSearch: {} }]
		},
		history: [
			// Seed the greeting so the model knows its own opening
			{
				role: 'model',
				parts: [
					{ text: "I'm AITfES 💡" },
					{ text: 'AI Troubleshooting for Energy Systems' },
					{
						text: 'My sole purpose is to guide you to a solution for energy engineering processes and techniques through a focused, step-by-step diagnostic flow.'
					}
				]
			},
			// Then replay the actual conversation history
			...history
		]
	});

	const result = await chat.sendMessage({ message });
	const reply = result.text?.trim() || '';

	safeLog('GEMINI_RESPONSE', { reply }, collector);

	return reply;
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
	collector?: any[]
): Promise<string> {
	try {
		const ai = getAi();

		const chat = ai.chats.create({
			model: 'gemini-2.5-flash',
			config: {
				systemInstruction: systemInstruction,
			},
			history: [
				// Custom greeting block
				{
					role: 'model',
					parts: productGreeting
				},
				...history
			]
		});

		const augmentedMessage = `Context Information from Vector DB:\n---\n${contextText || 'No specific context found in DB.'}\n---\n\nUser Question: ${message}`;
		const result = await chat.sendMessage({ message: augmentedMessage });
		const reply = result.text?.trim() || '';

		safeLog('GEMINI_RAG_RESPONSE', { reply }, collector);

		return reply;
	} catch (error) {
		const msg = extractErrorMessage(error);
		console.error(`[SINVERT:LLM_STEP] ${msg}`);
		throw new Error(msg);
	}
}

/**
 * Condenses chat history and a new message into a single standalone search query.
 */
export async function condenseQuery(
	history: Array<{ role: string; parts: Array<{ text: string }> }>,
	message: string,
	collector?: any[]
): Promise<string> {
	try {
		const ai = getAi();

		// Build a simple text representation of the history for context
		const historyText = history
			.slice(-6) // Only look at last 6 turns to keep it focused
			.map((m) => `${m.role.toUpperCase()}: ${m.parts.map((p) => p.text).join(' ')}`)
			.join('\n');

		const queryPrompt = `HISTORY:\n${historyText}\n\nUSER MESSAGE:\n${message}\n\nSTANDALONE QUERY:`;

		const result = await ai.models.generateContent({
			model: 'gemini-3.1-flash-lite-preview',
			config: {
				systemInstruction: 'You are a search query optimizer. Given a chat history and a new user message, rewrite the message into a concise, standalone objective search query that captures all necessary context. Do not answer the question. Only output the search query itself.'
			},
			contents: [{ role: 'user', parts: [{ text: queryPrompt }] }]
		});

		const condensed = result.text?.trim() || message;

		safeLog('CONDENSED_QUERY_GENERATED', { original: message, condensed }, collector);
		return condensed;
	} catch (error) {
		const msg = extractErrorMessage(error);
		safeLog('CONDENSE_STEP_FAILURE', { error: msg }, collector);
		console.error(`[SINVERT:CONDENSE_STEP] ${msg}`);

		// DO NOT Fallback - throw so the API handler can report the failure
		throw new Error(msg);
	}
}
