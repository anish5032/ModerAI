import { chunkSeconds, simulationDurationSeconds, simulationFlags } from '../data/moderation';
import { buildChunks, buildEvent, generateFlags, profileForChunk } from '../utils/moderation';
export class DemoModerationService {
    getChunks(mode, durationSeconds) {
        if (durationSeconds <= 0)
            return [];
        const flags = mode === 'upload'
            ? generateFlags(durationSeconds, chunkSeconds)
            : simulationFlags;
        return buildChunks(durationSeconds, chunkSeconds, flags);
    }
    getProfile(chunk) {
        return profileForChunk(chunk);
    }
    createEvent(chunk, profile, action, reviewed = false) {
        return buildEvent(chunk, profile, action, reviewed);
    }
    seedEvents(chunks, upTo) {
        return chunks
            .filter((chunk) => chunk.level !== 'safe' && chunk.end <= upTo)
            .slice(-8)
            .map((chunk) => {
            const profile = this.getProfile(chunk);
            return this.createEvent(chunk, profile, profile.recommended, true);
        })
            .reverse();
    }
}
/**
 * The live workspace still runs on the deterministic demo simulation, in BOTH modes.
 * Connecting it to backend results needs this interface to become async (next phase);
 * the Moderation page shows a banner when the backend is connected so this isn't misleading.
 */
export function createModerationService() {
    return new DemoModerationService();
}
export const moderationService = createModerationService();
export { simulationDurationSeconds };
