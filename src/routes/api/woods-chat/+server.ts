import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GoogleGenAI } from '@google/genai';
import { Pinecone } from '@pinecone-database/pinecone';
import { WOODS_GEMINI_API_KEY, WOODS_PINECONE_API, WOODS_PINECONE_INDEX, WOODS_PINECONE_NAMESPACE } from '$env/static/private';
import { WOODS_CONFIG } from '../../woods/woods_config';
import { safeLog } from '$lib/logger';

// --- Isolated RAG Logic for Woods ---

/**
 * Initialize Gemini for Woods
 */
function getWoodsAi() {
	if (!WOODS_GEMINI_API_KEY) throw new Error('Missing WOODS_GEMINI_API_KEY');
	return new GoogleGenAI({ apiKey: WOODS_GEMINI_API_KEY });
}

/**
 * Initialize Pinecone for Woods
 */
function getWoodsPinecone() {
	if (!WOODS_PINECONE_API) throw new Error('Missing WOODS_PINECONE_API');
	return new Pinecone({ apiKey: WOODS_PINECONE_API });
}

const FULL_MODEL_POOL = [
	'gemini-3.1-flash-lite-preview',
	'gemini-3-flash-preview',
	'gemini-2.5-flash',
	'gemini-3.1-pro-preview',
	'gemini-2.5-pro'
];

async function runWithFallback(
	modelPool: string[],
	operation: (modelName: string) => Promise<any>
) {
	let lastError: any = null;
	for (const modelName of modelPool) {
		try {
			return await operation(modelName);
		} catch (error) {
			lastError = error;
			console.warn(`[WOODS:FALLBACK] Model ${modelName} failed. Trying next...`);
		}
	}
	throw lastError;
}

/** POST /api/woods-chat */
export const POST: RequestHandler = async ({ request }) => {
	const encoder = new TextEncoder();
	const logs: any[] = [];
	let ragContext = '';

	const stream = new ReadableStream({
		async start(controller) {
			const sendStep = (label: string, model?: string) => {
				controller.enqueue(encoder.encode(JSON.stringify({ type: 'step', label, model }) + '\n'));
			};

			try {
				const { message, history } = await request.json();
				if (!message?.trim()) {
					controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', error: 'Message cannot be empty.' }) + '\n'));
					controller.close();
					return;
				}

				const ai = getWoodsAi();
				const geminiHistory = (history ?? []).map((m: any) => ({
					role: m.role,
					parts: [{ text: m.text }]
				}));

				// 1. CONDENSING
				sendStep('Condensing Query');
				const historyText = geminiHistory
					.slice(-6)
					.map((m: any) => `${m.role.toUpperCase()}: ${m.parts.map((p: any) => p.text).join(' ')}`)
					.join('\n');
				const queryPrompt = `HISTORY:\n${historyText}\n\nUSER MESSAGE:\n${message}\n\nSTANDALONE QUERY:`;

				const condensationResult = await runWithFallback(FULL_MODEL_POOL, async (m) => {
					return await ai.models.generateContent({
						model: m,
						config: {
							systemInstruction: 'You are a financial search query optimizer. Rewrite the user message into a concise, standalone search query for a financial report. Only output the query.'
						},
						contents: [{ role: 'user', parts: [{ text: queryPrompt }] }]
					});
				});

				const condensed = condensationResult.text || message;

				// 2. SEARCH
				sendStep('Querying Financial Database', condensationResult.modelName);
				const pc = getWoodsPinecone();
				const index = pc.index(WOODS_PINECONE_INDEX);
				const namespace = index.namespace(WOODS_PINECONE_NAMESPACE);

				const queryResponse = await namespace.searchRecords({
					query: { inputs: { text: condensed }, topK: 5 },
					fields: ['text'],
					rerank: { model: 'bge-reranker-v2-m3', rankFields: ['text'], topN: 5 }
				});

				const contextParts = queryResponse.result?.hits?.map((hit: any) => hit.fields?.text || '').filter(Boolean) || [];
				ragContext = contextParts.join('\n\n');
				sendStep('Financial Data Retrieved');

				// 3. FINAL RESPONSE
				sendStep('Generating Analysis');
				const augmentedMessage = `Context Information from Financial Report:\n---\n${ragContext || 'No specific data found for this query.'}\n---\n\nUser Question: ${message}`;

				const finalResult = await runWithFallback(FULL_MODEL_POOL, async (m) => {
					const chat = ai.chats.create({
						model: m,
						config: { systemInstruction: WOODS_CONFIG.systemInstruction },
						history: [
							{ role: 'model', parts: WOODS_CONFIG.greeting.map(g => ({ text: g.text })) },
							...geminiHistory
						]
					});

					return await chat.sendMessage({ message: augmentedMessage });
				});

				const responseData = {
					reply: finalResult.text,
					debug: {
						endpoint: '/api/woods-chat',
						condensedMessage: condensed,
						ragContextUsed: ragContext || 'No context matched.',
						modelsUsed: { condensation: condensationResult.modelName, chat: finalResult.modelName }
					}
				};

				controller.enqueue(encoder.encode(JSON.stringify({ type: 'final', ...responseData }) + '\n'));
			} catch (e) {
				console.error('[WOODS:ERROR]', e);
				controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', error: e instanceof Error ? e.message : 'Unknown error' }) + '\n'));
			} finally {
				controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'application/x-ndjson',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive'
		}
	});
};
