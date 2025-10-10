import { GoogleGenAI } from '@google/genai';
import type { Chat } from '@google/genai';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

/**
 * Creates and returns a new Gemini Chat session instance.
 * @param systemInstruction The system instruction for the model.
 * @returns A Promise<Chat> instance.
 */
export async function createChatSession(systemInstruction: string): Promise<Chat> {
	if (!GEMINI_API_KEY || GEMINI_API_KEY.trim() === '') {
		throw new Error('Cannot create chat session: API Key is missing or empty.');
	}

	const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

	const chat = await ai.chats.create({
		model: 'gemini-2.5-flash',
		config: {
			systemInstruction: systemInstruction,
			tools: [{ googleSearch: {} }]
		},
		history: [
			{
				role: 'model',
				parts: [
					{ text: "I'm AITfES 💡" },
					{ text: 'AI Troubleshooting for Energy Systems' },
					{
						text: 'My sole purpose is to guide you to a solution for energy engineering processes and techniques through a focused, step-by-step diagnostic flow.'
					}
				]
			}
		]
	});

	return chat;
}
