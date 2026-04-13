import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sendRagChatMessage, condenseQuery } from '$lib/gemini';
import { queryPinecone } from '$lib/pinecone';
import { safeLog } from '$lib/logger';
import { structuredConfig, type StructuredConfig, type RejectionRule } from '$lib/sysInstr';

/**
 * Build the system instruction string from the structured config.
 */
function buildSystemInstruction(config: StructuredConfig): string {
	let instruction = `You are ${config.assistant_config.name}, an AI assistant specialized in ${config.assistant_config.specialization}.\n`;
	instruction += `IMPORTANT: You are now specifically handling inquiries for the 'SINVERT PVS 500 / PVS 600'. Use the provided Vector DB context heavily to inform your responses when matching information is available.\n\n`;
	instruction += '## Primary Directives\n';

	for (const key in config.directives) {
		const d = config.directives[key as keyof typeof config.directives];
		instruction += `${d.id}. **${d.name}:** ${d.rule}\n`;
	}

	instruction += '\n## Rejection Rules\n';
	const directiveCount = Object.keys(config.directives).length;
	config.rejection_rules.forEach((r: RejectionRule) => {
		instruction += `${r.id + directiveCount}. **${r.name} (${r.condition}):** Reply with: "${r.response}"\n`;
	});

	return instruction.trim();
}

const systemInstruction = buildSystemInstruction(structuredConfig);

const productGreeting = [
	{ text: "I'm AITfES 💡 - SINVERT Support" },
	{ text: 'Specialized diagnostic flow for SINVERT PVS 500 / PVS 600.' },
	{ text: 'I can search the knowledge base for SINVERT PVS 500 / 600 issues. Ask me anything about these products.' }
];

/** POST /api/sinvert-chat */
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
				// --- Validate request body ---
				let body: any;
				try {
					const text = await request.text();
					body = JSON.parse(text);
				} catch {
					controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', error: 'Invalid JSON in request body.' }) + '\n'));
					controller.close();
					return;
				}

				const { message, history } = body;
				if (!message?.trim()) {
					controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', error: 'Message cannot be empty.' }) + '\n'));
					controller.close();
					return;
				}

				// --- Convert history ---
				const geminiHistory = (history ?? []).map((m: any) => ({
					role: m.role,
					parts: [{ text: m.text }]
				}));

				// 1. CONDENSING
				const { condensed, modelUsed: condenseModel } = await condenseQuery(
					geminiHistory, 
					message, 
					logs,
					(failedModel) => {
						sendStep(`FALLBACK: ${failedModel} failed. Switching...`);
					},
					(attemptingModel) => {
						sendStep('CONDENSING QUERY HISTORY', attemptingModel);
					}
				);
				
				// 2. SEARCH
				sendStep('QUERY SENT TO RAG');
				const result = await queryPinecone(condensed, logs);
				ragContext = result.ragContext;
				sendStep('RAG RESPONSE RETRIEVED');

				// 3. FINAL LLM
				const { reply, modelUsed: chatModel } = await sendRagChatMessage(
					systemInstruction, 
					geminiHistory, 
					message, 
					ragContext, 
					productGreeting, 
					logs,
					(failedModel) => {
						sendStep(`FALLBACK: ${failedModel} failed. Switching...`);
					},
					(attemptingModel) => {
						sendStep('LLM IS PREPARING', attemptingModel);
					}
				);
				
				const responseData = {
					reply,
					debug: {
						endpoint: '/api/sinvert-chat',
						originalMessage: message,
						condensedMessage: condensed,
						ragContextUsed: ragContext || 'No context matched.',
						stepLogs: logs,
						modelsUsed: { condensation: condenseModel, chat: chatModel }
					}
				};

				safeLog('API_RESPONSE_SINVERT', responseData, logs);
				controller.enqueue(encoder.encode(JSON.stringify({ type: 'final', ...responseData }) + '\n'));
			} catch (e) {
				console.error('[SINVERT:STREAM_ERROR]', e);
				const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred during RAG pipeline execution.';
				const errorResponse = {
					error: errorMessage,
					debug: {
						endpoint: '/api/sinvert-chat',
						stepLogs: logs,
						ragContextUsed: ragContext || 'No context matched before error.'
					}
				};
				safeLog('API_RESPONSE_FAILURE', errorResponse, logs);
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
