/**
 * Safe logging utility to ensure logging itself never breaks the main execution flow.
 * Each log is handled independently.
 */
export function safeLog(label: string, data: any, collector?: any[]) {
	try {
		const timestamp = new Date().toISOString();
		const logEntry = { timestamp, label, data };
		
		// Terminal log
		console.log(`\n--- [${timestamp}] ${label} ---\n`, JSON.stringify(data, null, 2), '\n-----------------------------------\n');
		
		// Optional collection for API response
		if (collector) {
			collector.push(logEntry);
		}
	} catch (error) {
		console.error(`[LOGGER_FAILURE] Failed to log ${label}:`, error);
	}
}
