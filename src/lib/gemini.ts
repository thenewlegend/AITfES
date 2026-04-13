import { GoogleGenAI } from '@google/genai';
import { GEMINI_API_KEY } from '$env/static/private';

// Helper to initialize GenAI safely
function getAi() {
	if (!GEMINI_API_KEY || GEMINI_API_KEY.trim() === '') {
		throw new Error('Server configuration error: GEMINI_API_KEY is missing or empty.');
	}
	return new GoogleGenAI({ apiKey: GEMINI_API_KEY });
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
	message: string
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
	return result.text?.trim() || '';
}


/**
 * Alternative chat function for RAG that injects external context into the final user message.
 */
export async function sendRagChatMessage(
	systemInstruction: string,
	history: Array<{ role: string; parts: Array<{ text: string }> }>,
	message: string,
	contextText: string,
	productGreeting: Array<{ text: string }>
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
		return result.text?.trim() || '';
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		console.error(`[SINVERT:LLM_STEP] ${msg}`);
		throw new Error(`[SINVERT:LLM_STEP] ${msg}`);
	}
}
