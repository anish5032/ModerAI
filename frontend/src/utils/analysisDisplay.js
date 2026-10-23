const RISK_LEVELS = ['safe', 'low', 'moderate', 'high', 'critical'];
const ANALYSIS_MODALITIES = ['text', 'visual'];
const MODALITY_LABELS = {
    text: 'Text',
    visual: 'Visual'
};
const RISK_RANK = {
    safe: 0,
    low: 1,
    moderate: 2,
    high: 3,
    critical: 4
};

export function normalizeRiskLevel(level) {
    return RISK_LEVELS.includes(level) ? level : null;
}

function arrayValue(value) {
    return Array.isArray(value) ? value : null;
}

export function getUnavailableModalities(result = {}) {
    result = result ?? {};
    const explicit = arrayValue(result.unavailableModalities) ?? [];
    const unavailable = new Set(explicit.filter((modality) => ANALYSIS_MODALITIES.includes(modality)));

    const textStatus = result.textAnalysis?.status;
    if (textStatus === 'completed') unavailable.delete('text');
    else if (textStatus === 'failed') unavailable.add('text');

    const visualStatus = result.visualAnalysis?.status;
    if (visualStatus === 'completed') unavailable.delete('visual');
    else if (visualStatus === 'failed') unavailable.add('visual');

    const analyzed = arrayValue(result.modalitiesAnalyzed);
    if (analyzed) {
        if (!analyzed.includes('text') && !textStatus) unavailable.add('text');
        if (!analyzed.includes('visual') && !visualStatus) unavailable.add('visual');
    }

    return ANALYSIS_MODALITIES.filter((modality) => unavailable.has(modality));
}

export function isModalityAvailable(result = {}, modality) {
    result = result ?? {};
    if (modality === 'audio') {
        const unavailable = arrayValue(result?.unavailableModalities) ?? [];
        return !unavailable.includes('audio');
    }
    return !getUnavailableModalities(result).includes(modality);
}

export function isPartialAnalysis(result = {}) {
    result = result ?? {};
    if (result.partial === true || result.analysisStatus === 'partial') return true;
    if (getUnavailableModalities(result).length > 0) return true;

    const analyzed = arrayValue(result.modalitiesAnalyzed);
    if (analyzed && analyzed.length > 0) {
        const hasText = analyzed.includes('text');
        const hasVisual = analyzed.includes('visual');
        if (hasText !== hasVisual) return true;
    }

    return false;
}

export function getTextChunkRisk(result = {}) {
    result = result ?? {};
    const available = isModalityAvailable(result, 'text');
    const rawScore = result.riskScore;
    const numericScore = rawScore === null || rawScore === undefined || rawScore === ''
        ? NaN
        : Number(rawScore);
    return {
        available,
        level: available ? normalizeRiskLevel(result.riskLevel) : null,
        score: available && Number.isFinite(numericScore) ? numericScore : null
    };
}

export function getCombinedRisk(result = {}) {
    result = result ?? {};
    const combinedLevel = normalizeRiskLevel(result.combinedRiskLevel);
    if (combinedLevel) return { level: combinedLevel, source: 'combined' };

    const candidates = [];
    const textAvailable = isModalityAvailable(result, 'text');
    const textLevel = textAvailable ? normalizeRiskLevel(result.riskLevel) : null;
    if (textLevel) candidates.push(textLevel);

    const flaggedFrames = Number(result.visualAnalysis?.flaggedFrameCount);
    if (
        result.visualAnalysis?.status === 'completed' &&
        Number.isFinite(flaggedFrames) &&
        flaggedFrames > 0
    ) {
        candidates.push('moderate');
    }

    if (candidates.length === 0) return { level: null, source: null };

    const level = candidates.reduce((highest, candidate) =>
        RISK_RANK[candidate] > RISK_RANK[highest] ? candidate : highest
    );

    return {
        level,
        source: textLevel === level ? 'text' : 'visual'
    };
}

export function getEffectiveModerationDecision(result = {}) {
    result = result ?? {};
    const decision = result.moderationDecision;
    const partial = isPartialAnalysis(result);

    if (decision === 'allow' && partial) return 'review';
    if (decision === 'review' || decision === 'allow') return decision;

    return partial ? 'review' : null;
}

export function getPartialAnalysisMessage(result = {}) {
    result = result ?? {};
    if (!isPartialAnalysis(result)) return null;

    const unavailable = getUnavailableModalities(result);

    if (unavailable.length === 0) {
        return 'One or more modalities are unavailable. Human review is required.';
    }

    if (unavailable.length === ANALYSIS_MODALITIES.length) {
        return 'Text and visual analysis are unavailable. Human review is required.';
    }

    const missing = MODALITY_LABELS[unavailable[0]];
    const remaining = ANALYSIS_MODALITIES
        .filter((modality) => !unavailable.includes(modality))
        .map((modality) => MODALITY_LABELS[modality].toLowerCase())
        .join(' and ');

    return `${missing} analysis is unavailable. Results are based on ${remaining} analysis only. Human review is required.`;
}

export function getModalityStatus(result = {}, modality) {
    result = result ?? {};
    const details = modality === 'text' ? result.textAnalysis : result.visualAnalysis;
    const status = details?.status;

    if (status === 'completed') return { state: 'completed', label: 'Completed' };
    if (status === 'failed') return { state: 'failed', label: 'Unavailable' };
    if (!isModalityAvailable(result, modality)) return { state: 'unavailable', label: 'Unavailable' };

    const analyzed = arrayValue(result.modalitiesAnalyzed);
    if (analyzed?.includes(modality)) return { state: 'completed', label: 'Completed' };

    return { state: 'unknown', label: 'Not available' };
}

export function formatRiskScore(score) {
    if (score === null || score === undefined || score === '') return null;
    const numeric = Number(score);
    return Number.isFinite(numeric) ? numeric.toFixed(2) : null;
}
