import { Pinecone } from '@pinecone-database/pinecone';
import { PINECONE_API } from '$env/static/private';
import { safeLog } from './logger';

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

export async function queryPinecone(queryText: string, collector?: any[]): Promise<{ ragContext: string }> {
	try {
		const pc = getPinecone();
		const index = pc.index('sinvert');
		const namespace = index.namespace('sinvert-pvs500-600');

		safeLog('TEXT_SENT_TO_PINECONE', { query: queryText }, collector);

		// @ts-ignore - searchRecords might not be fully typed in all versions yet, or might need specific options.
		const queryResponse = await namespace.searchRecords({
			query: {
				inputs: { text: queryText },
				topK: 5
			},
			fields: ['text'],
			rerank: {
				model: 'bge-reranker-v2-m3',
				rankFields: ['text'],
				topN: 5
			}
		});

		safeLog('PINECONE_RESPONSE', queryResponse, collector);

		if (!queryResponse.result || !queryResponse.result.hits || queryResponse.result.hits.length === 0) {
			return { ragContext: '' };
		}

		// Extract context from fields.
		const contextParts = queryResponse.result.hits
			.map((hit: any) => {
				return hit.fields?.text || '';
			})
			.filter((t: string) => t.length > 0);

		const finalContext = contextParts.join('\n\n');
		safeLog('FINAL_RETRIEVED_CONTEXT_STRING', { context: finalContext }, collector);
		return { ragContext: finalContext };
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		console.error(`[SINVERT:PINECONE_STEP] ${msg}`);
		throw new Error(`[SINVERT:PINECONE_STEP] ${msg}`);
	}
}
