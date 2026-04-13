/**
 * Safe logging utility to ensure logging itself never breaks the main execution flow.
 * Each log is handled independently.
 */
export function safeLog(label: string, data: any, collector?: any[]) {
	try {
		const timestamp = new Date().toISOString();
		
		// Terminal log - browser-like direct logging is usually best for the terminal
		console.log(`\n--- [${timestamp}] ${label} ---`);
		console.log(data);
		console.log('-----------------------------------\n');
		
		// Optional collection for API response
		if (collector) {
			try {
				// We stringify and parse to break references and ensure it's serializable
				const serializableData = JSON.parse(JSON.stringify(data));
				collector.push({ timestamp, label, data: serializableData });
			} catch (e) {
				collector.push({ timestamp, label, data: `[unserializable data: ${label}]` });
			}
		}
	} catch (error) {
		console.error(`[LOGGER_FAILURE] Failed to log ${label}:`, error);
	}
}
