// src/lib/gemini.ts

import { GoogleGenAI } from '@google/genai';
import type { Chat } from '@google/genai';

// 🔑 HARDCODED API KEY
// NOTE: This key is for demonstration purposes only. Replace it with your actual key.
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

/**
 * Creates and returns a new Gemini Chat session instance using a hardcoded key.
 * @param systemInstruction The system instruction for the model.
 * @returns A Promise<Chat> instance.
 */
export async function createChatSession(systemInstruction: string): Promise<Chat> {
	if (!GEMINI_API_KEY || GEMINI_API_KEY.trim() === '') {
		throw new Error('Cannot create chat session: API Key is missing or empty.');
	}

	try {
		// 🚀 FIX: Pass the key inside an object with the 'apiKey' property.
		const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

		// AWAIT is mandatory here as this is an asynchronous network call
		const chat = await ai.chats.create({
			model: 'gemini-2.5-flash',
			config: {
				systemInstruction: systemInstruction,
				tools: [{ googleSearch: {} }]
			},
			// 🆕 UPDATED: Initial greeting from the AI (role: 'model')
			history: [
				// 1. Initial Greeting/Persona Setup
				{
					role: 'model',
					parts: [{ text: '' }]
				}
			]
		});

		return chat;
	} catch (e) {
		throw e;
	}
}
