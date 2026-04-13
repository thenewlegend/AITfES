import { Pinecone } from '@pinecone-database/pinecone';
import { PINECONE_API } from '$env/static/private';
import { embedText } from './gemini';

let pineconeClient: Pinecone | null = null;

function getPinecone(): Pinecone {
	if (!pineconeClient) {
		if (!PINECONE_API || PINECONE_API.trim() === '') {
			throw new Error('Missing PINECONE_API environment variable');
		}
		pineconeClient = new Pinecone({
			apiKey: PINECONE_API
		});
	}
	return pineconeClient;
}

export async function queryPinecone(queryText: string): Promise<{ ragContext: string; embedData: number[] }> {
	try {
		const pc = getPinecone();
		const index = pc.index('sinvert');
		const namespace = index.namespace('sinvert-pvs500-600');

		// Generate embedding for the query
		const embedding = await embedText(queryText);

		const queryResponse = await namespace.query({
			vector: embedding,
			topK: 5,
			includeMetadata: true
		});

		if (!queryResponse.matches || queryResponse.matches.length === 0) {
			return { ragContext: '', embedData: embedding };
		}

		// Extract context from metadata.
		// Assuming the text is in 'text' field of metadata. Adjust if the source uses different keys.
		const contextParts = queryResponse.matches
			.map((match) => {
				const metadata = match.metadata as Record<string, any> | undefined;
				return metadata?.text || '';
			})
			.filter((t) => t.length > 0);

		const finalContext = contextParts.join('\n\n');
		console.log('\n--- [SINVERT:RETRIEVED_CONTEXT] ---\n', finalContext, '\n-----------------------------------\n');
		return { ragContext: finalContext, embedData: embedding };
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		console.error(`[SINVERT:PINECONE_STEP] ${msg}`);
		throw new Error(`[SINVERT:PINECONE_STEP] ${msg}`);
	}
}
