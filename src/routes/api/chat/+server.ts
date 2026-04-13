import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sendChatMessage } from '$lib/gemini';
import { safeLog } from '$lib/logger';
import { structuredConfig, type StructuredConfig, type RejectionRule } from '$lib/sysInstr';

/**
 * Build the system instruction string from the structured config.
 * Kept here on the server so the client never needs to import sysInstr.
 */
function buildSystemInstruction(config: StructuredConfig): string {
	let instruction = `You are ${config.assistant_config.name}, an AI assistant specialized in ${config.assistant_config.specialization}.\n\n`;
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

/** POST /api/chat */
export const POST: RequestHandler = async ({ request }) => {
	const encoder = new TextEncoder();
	const logs: any[] = [];

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

				if (
					typeof body !== 'object' ||
					body === null ||
					typeof body.message !== 'string'
				) {
					controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', error: 'Missing or invalid "message" field.' }) + '\n'));
					controller.close();
					return;
				}

				const { message, history } = body;

				if (!message.trim()) {
					controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', error: 'Message cannot be empty.' }) + '\n'));
					controller.close();
					return;
				}

				// --- Convert ChatMessage[] history to Gemini Content[] format ---
				const geminiHistory = (history ?? []).map((m: any) => ({
					role: m.role,
					parts: [{ text: m.text }]
				}));

				// --- Call Gemini ---
				const { reply, modelUsed } = await sendChatMessage(
					systemInstruction, 
					geminiHistory, 
					message, 
					logs,
					(failedModel) => {
						sendStep(`FALLBACK: ${failedModel} failed. Switching...`);
					},
					(attemptingModel) => {
						sendStep('THINKING', attemptingModel);
					}
				);

				const responseData = {
					reply,
					debug: {
						endpoint: '/api/chat',
						type: 'standard_chat',
						stepLogs: logs,
						modelUsed
					}
				};
				
				safeLog('API_RESPONSE_CHAT', responseData, logs);
				
				controller.enqueue(encoder.encode(JSON.stringify({ type: 'final', ...responseData }) + '\n'));
			} catch (e) {
				console.error('[/api/chat] Gemini error:', e);
				const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred while contacting the AI.';
				const errorResponse = {
					error: errorMessage,
					debug: {
						endpoint: '/api/chat',
						stepLogs: logs
					}
				};
				safeLog('API_RESPONSE_CHAT_FAILURE', errorResponse, logs);
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
