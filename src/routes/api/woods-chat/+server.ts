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
	'gemini-2.5-pro',
	'gemma-4-31b-it'
];

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
			const msg = error instanceof Error ? error.message : String(error);
			safeLog(`${label}_FALLBACK_TRIGGERED`, { modelAttempted: modelName, error: msg }, collector);
			console.warn(`[WOODS:FALLBACK] Model ${modelName} failed for ${label}. Error: ${msg}`);
			if (onFallback) onFallback(modelName, msg);
			await new Promise(r => setTimeout(r, 500)); // Brief delay for observability
		}
	}
	throw lastError;
}

/**
 * Extracts a concise, user-friendly message from potentially complex AI/API error objects.
 * Particularly prevents technical "JSON dumps" from overflowing the UI.
 */
function extractUsefulError(e: any): string {
	if (!e) return 'An unexpected error occurred.';
	const raw = e instanceof Error ? e.message : String(e);

	// Check for common AI rate limit/quota issues
	if (raw.includes('429') || raw.toLowerCase().includes('quota') || raw.toLowerCase().includes('rate limit')) {
		return 'Rate limit exceeded. The system is currently handling high traffic. Please try again in 60 seconds.';
	}

	if (raw.includes('500') || raw.toLowerCase().includes('internal server error')) {
		return 'The AI service is temporarily unavailable. We are automatically attempting fallbacks.';
	}

	// If it's a JSON string (common in Gemini SDK errors), try to parse and get the message
	try {
		const parsed = JSON.parse(raw);
		if (parsed.error?.message) return parsed.error.message;
		if (Array.isArray(parsed) && parsed[0]?.error?.message) return parsed[0].error.message;
	} catch (err) {
		// Not JSON, continue
	}

	// Truncate if still too long
	return raw.length > 150 ? raw.slice(0, 147) + '...' : raw;
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
				const body = await request.json();
				const { message, history } = body;

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

				safeLog('WOODS_QUERY_INITIATED', { message }, logs);

				// 1. CONDENSING
				const { result: condensationResult, modelName: condenseModel } = await runWithFallback(
					FULL_MODEL_POOL,
					async (m) => {
						return await ai.models.generateContent({
							model: m,
							config: {
								systemInstruction: 'You are a financial search query optimizer. Rewrite the user message into a concise, standalone search query for a financial report. Only output the query.'
							},
							contents: [{ role: 'user', parts: [{ text: `HISTORY:\n${geminiHistory.slice(-4).map((h: any) => h.role + ': ' + h.parts[0].text).join('\n')}\n\nUSER:${message}\n\nSTANDALONE QUERY:` }] }]
						});
					},
					'CONDENSE',
					logs,
					(m) => sendStep(`FALLBACK: ${m} failed. Switching...`),
					(m) => sendStep('Condensing Query', m)
				);

				const condensed = condensationResult.text || message;
				safeLog('WOODS_QUERY_CONDENSED', { original: message, condensed, modelUsed: condenseModel }, logs);

				// 2. SEARCH
				sendStep('Querying Financial Database');
				const pc = getWoodsPinecone();
				const index = pc.index(WOODS_PINECONE_INDEX);
				const namespace = index.namespace(WOODS_PINECONE_NAMESPACE);

				const queryResponse = await namespace.searchRecords({
					query: { inputs: { text: condensed }, topK: 12 },
					rerank: { model: 'bge-reranker-v2-m3', rankFields: ['text'], topN: 10 }
				});

				const contextParts = queryResponse.result?.hits?.map((hit: any) => {
					if (!hit.fields) return '';
					// Formulate a rich context string including all metadata fields for the LLM
					const metadataStr = Object.entries(hit.fields)
						.filter(([key]) => key !== 'text')
						.map(([key, val]) => `${key}: ${val}`)
						.join(' | ');
					return `[${metadataStr}]\n${hit.fields.text || ''}`;
				}).filter(Boolean) || [];
				ragContext = contextParts.join('\n\n---\n\n');

				safeLog('WOODS_RAG_RETRIEVED', { numResults: contextParts.length, contextPreview: ragContext.slice(0, 200) }, logs);
				sendStep('Financial Data Retrieved');

				// 3. FINAL RESPONSE
				const augmentedMessage = `Context Information from Financial Report:\n---\n${ragContext || 'No specific data found for this query.'}\n---\n\nUser Question: ${message}`;

				const { result: finalResult, modelName: chatModel } = await runWithFallback(
					FULL_MODEL_POOL,
					async (m) => {
						const chat = ai.chats.create({
							model: m,
							config: { systemInstruction: WOODS_CONFIG.systemInstruction },
							history: [
								{ role: 'model', parts: WOODS_CONFIG.greeting.map(g => ({ text: g.text })) },
								...geminiHistory
							]
						});
						return await chat.sendMessage({ message: augmentedMessage });
					},
					'CHAT',
					logs,
					(m) => sendStep(`FALLBACK: ${m} failed. Switching...`),
					(m) => sendStep('Generating Analysis', m)
				);

				const responseData = {
					reply: finalResult.text,
					debug: {
						endpoint: '/api/woods-chat',
						originalMessage: message,
						condensedMessage: condensed,
						ragContextUsed: ragContext || 'No context matched.',
						stepLogs: logs,
						modelsUsed: { condensation: condenseModel, chat: chatModel }
					}
				};

				safeLog('WOODS_RESPONSE_GENERATED', { modelUsed: chatModel }, logs);
				controller.enqueue(encoder.encode(JSON.stringify({ type: 'final', ...responseData }) + '\n'));
			} catch (e: any) {
				console.error('[WOODS:ERROR]', e);
				const errorMsg = extractUsefulError(e);
				const errorResponse = {
					error: errorMsg,
					debug: {
						endpoint: '/api/woods-chat',
						stepLogs: logs,
						ragContextUsed: ragContext || 'Error occurred before retrieval.',
						rawError: e instanceof Error ? e.message : String(e)
					}
				};
				safeLog('WOODS_PIPELINE_ERROR', { error: errorMsg, raw: e?.message }, logs);
				controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', ...errorResponse }) + '\n'));
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
