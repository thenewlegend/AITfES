import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sendChatMessage } from '$lib/gemini';
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

	// --- Call Gemini ---
	try {
		const reply = await sendChatMessage(systemInstruction, geminiHistory, message);
		return json({ reply });
	} catch (e) {
		console.error('[/api/chat] Gemini error:', e);
		const errorMessage =
			e instanceof Error ? e.message : 'An unknown error occurred while contacting the AI.';
		return json({ error: errorMessage }, { status: 500 });
	}
};
