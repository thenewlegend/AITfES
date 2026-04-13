import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sendRagChatMessage } from '$lib/gemini';
import { queryPinecone } from '$lib/pinecone';
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
	// --- Validate request body ---
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON in request body.' }, { status: 400 });
	}

	if (
		typeof body !== 'object' ||
		body === null ||
		typeof (body as Record<string, unknown>).message !== 'string'
	) {
		return json({ error: 'Missing or invalid "message" field.' }, { status: 400 });
	}

	const { message, history } = body as {
		message: string;
		history?: Array<{ role: 'user' | 'model'; text: string }>;
	};

	if (!message.trim()) {
		return json({ error: 'Message cannot be empty.' }, { status: 400 });
	}

	// --- Convert ChatMessage[] history to Gemini Content[] format ---
	const geminiHistory = (history ?? []).map((m) => ({
		role: m.role,
		parts: [{ text: m.text }]
	}));

	try {
		// --- Obtain Vector DB Context ---
		const { ragContext } = await queryPinecone(message);

		// --- Call Gemini ---
		const reply = await sendRagChatMessage(systemInstruction, geminiHistory, message, ragContext, productGreeting);
		return json({
			reply,
			debug: {
				endpoint: '/api/sinvert-chat',
				ragContextUsed: ragContext || 'No context matched.'
			}
		});
	} catch (e) {
		console.error('[SINVERT:ROUTE_CATCH] Uncaught error reached the top-level route endpoint:', e);
		const errorMessage =
			e instanceof Error ? e.message : 'An unknown error occurred during RAG pipeline execution.';
		return json({ error: errorMessage }, { status: 500 });
	}
};
