import { useState } from 'react';
import { reviewService } from '../services/reviewService';
export function useReviewSession(onResolve) {
    const [reviewEvent, setReviewEvent] = useState(null);
    function resolve(eventId, action) {
        reviewService.createDecision(eventId, action);
        onResolve(eventId);
        setReviewEvent(null);
    }
    return {
        reviewEvent,
        openReview: setReviewEvent,
        closeReview: () => setReviewEvent(null),
        resolve
    };
}
