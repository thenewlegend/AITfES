import { GoogleGenAI } from '@google/genai';
import { GEMINI_API_KEY } from '$env/static/private';

/**
 * Server-only module — sends a single chat message to Gemini with conversation history.
 *
 * This must NEVER be imported from client-side code. SvelteKit will enforce this
 * because `$env/static/private` is blocked from client imports.
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
	if (!GEMINI_API_KEY || GEMINI_API_KEY.trim() === '') {
		throw new Error('Server configuration error: GEMINI_API_KEY is missing or empty.');
	}

	const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

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

	const result = await (await chat).sendMessage({ message });
	return result.text?.trim() || '';
}
