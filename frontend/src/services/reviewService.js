class DemoReviewService {
    createDecision(eventId, action, source = 'human') {
        return {
            id: `decision-${eventId}`,
            eventId,
            action,
            source,
            reason: null
        };
    }
}
export const reviewService = new DemoReviewService();
