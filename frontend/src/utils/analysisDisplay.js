const RISK_LEVELS = ['safe', 'low', 'moderate', 'high', 'critical'];
const ANALYSIS_MODALITIES = ['text', 'visual', 'audio'];
const MODALITY_LABELS = {
    text: 'Text',
    visual: 'Visual',
    audio: 'Audio'
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

    const audioStatus = result.audioAnalysis?.status;
    if (audioStatus === 'completed') unavailable.delete('audio');
    else if (audioStatus === 'failed' || audioStatus === 'no_audio') unavailable.add('audio');

    const analyzed = arrayValue(result.modalitiesAnalyzed);
    if (analyzed) {
        if (!analyzed.includes('text') && !textStatus) unavailable.add('text');
        if (!analyzed.includes('visual') && !visualStatus) unavailable.add('visual');
        if (analyzed.includes('audio')) unavailable.delete('audio');
    }

    return ANALYSIS_MODALITIES.filter((modality) => unavailable.has(modality));
}

export function isModalityAvailable(result = {}, modality) {
    result = result ?? {};
    return !getUnavailableModalities(result).includes(modality);
}

export function isPartialAnalysis(result = {}) {
    result = result ?? {};
    if (result.partial === true || result.analysisStatus === 'partial') return true;

    const blockingUnavailable = getUnavailableModalities(result)
        .filter((modality) => modality !== 'audio');
    if (blockingUnavailable.length > 0) return true;
    if (result.audioAnalysis?.status === 'failed') return true;

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
    const level = result.textAnalysis?.riskLevel ?? result.riskLevel;
    const rawScore = result.modalityRiskScores?.text ?? result.riskScore;
    const numericScore = rawScore === null || rawScore === undefined || rawScore === ''
        ? NaN
        : Number(rawScore);
    return {
        available,
        level: available ? normalizeRiskLevel(level) : null,
        score: available && Number.isFinite(numericScore) ? numericScore : null
    };
}

export function getAudioRisk(result = {}) {
    result = result ?? {};
    const available = isModalityAvailable(result, 'audio');
    const analysis = result.audioAnalysis ?? {};
    const rawScore = result.modalityRiskScores?.audio ?? analysis.riskScore;
    const numericScore = rawScore === null || rawScore === undefined || rawScore === ''
        ? NaN
        : Number(rawScore);
    return {
        available,
        status: analysis.status ?? (available ? null : 'unavailable'),
        level: available ? normalizeRiskLevel(analysis.actionableRiskLevel ?? analysis.riskLevel) : null,
        score: available && Number.isFinite(numericScore) ? numericScore : null,
        eventCount: Number(analysis.flaggedEventCount) || 0,
        informationalCount: Number(analysis.informationalEventCount) || 0
    };
}

export function getCombinedRisk(result = {}) {
    result = result ?? {};
    const combinedLevel = normalizeRiskLevel(result.combinedRiskLevel);
    const candidates = [];
    const textAvailable = isModalityAvailable(result, 'text');
    const textLevel = textAvailable
        ? normalizeRiskLevel(result.textAnalysis?.riskLevel ?? result.riskLevel)
        : null;
    if (textLevel && textLevel !== 'safe') {
        candidates.push({ level: textLevel, source: 'text' });
    }

    const flaggedFrames = Number(result.visualAnalysis?.flaggedFrameCount);
    if (
        result.visualAnalysis?.status === 'completed' &&
        Number.isFinite(flaggedFrames) &&
        flaggedFrames > 0
    ) {
        candidates.push({
            level: normalizeRiskLevel(result.visualAnalysis?.riskLevel) ?? 'moderate',
            source: 'visual'
        });
    }

    const audio = getAudioRisk(result);
    if (audio.available && audio.eventCount > 0 && audio.level) {
        candidates.push({ level: audio.level, source: 'audio' });
    }

    if (combinedLevel) {
        const flagged = arrayValue(result.flaggedModalities)
            ?.filter((modality) => ANALYSIS_MODALITIES.includes(modality)) ?? [];
        let source = 'combined';

        if (flagged.length === 1) source = flagged[0];
        else if (flagged.length > 1) source = 'multiple';
        else if (candidates.length === 1) source = candidates[0].source;
        else if (candidates.length > 1) source = 'multiple';

        return { level: combinedLevel, source };
    }

    if (candidates.length === 0) return { level: null, source: null };

    const highest = candidates.reduce((current, candidate) =>
        RISK_RANK[candidate.level] > RISK_RANK[current.level] ? candidate : current
    );

    return {
        level: highest.level,
        source: candidates.length > 1 ? 'multiple' : highest.source
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
        return 'Text, visual, and audio analysis are unavailable. Human review is required.';
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
    if (modality === 'audio') {
        const analysis = result.audioAnalysis;
        if (analysis?.status === 'completed') return { state: 'completed', label: 'Completed' };
        if (analysis?.status === 'no_audio') return { state: 'not_applicable', label: 'No audio track' };
        if (analysis?.status === 'failed') return { state: 'failed', label: 'Unavailable' };
        if (arrayValue(result.modalitiesAnalyzed)?.includes('audio')) {
            return { state: 'completed', label: 'Completed' };
        }
        return { state: 'unknown', label: 'Not evaluated' };
    }

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
