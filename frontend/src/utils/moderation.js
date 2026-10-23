import { clearTags, elevatedTags, modalityLabels, modelNames, threatByModality } from '../data/moderation';
export function formatTimecode(totalSeconds) {
    const safe = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor(safe % 3600 / 60);
    const seconds = safe % 60;
    return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}
export function formatClock(totalSeconds) {
    const safe = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(safe / 60);
    const seconds = safe % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
function hash(seed) {
    const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return value - Math.floor(value);
}
export function buildChunks(durationSeconds, chunkSeconds, flags) {
    const flagById = new Map(flags.map((flag) => [flag.id, flag]));
    const count = Math.max(1, Math.ceil(durationSeconds / chunkSeconds));
    const chunks = [];
    for (let index = 0; index < count; index += 1) {
        const id = index + 1;
        const flag = flagById.get(id);
        chunks.push({
            id,
            start: index * chunkSeconds,
            end: Math.min((index + 1) * chunkSeconds, durationSeconds),
            level: flag ? flag.level : 'safe',
            modality: flag?.modality,
            threat: flag?.threat
        });
    }
    return chunks;
}
const modalities = ['visual', 'audio', 'text'];
/** Deterministic pseudo-analysis for an uploaded clip of arbitrary length. */
export function generateFlags(durationSeconds, chunkSeconds) {
    const count = Math.max(1, Math.ceil(durationSeconds / chunkSeconds));
    const flags = [];
    for (let index = 0; index < count; index += 1) {
        const id = index + 1;
        const roll = hash(id);
        if (roll < 0.74)
            continue;
        const modality = modalities[Math.floor(hash(id + 91) * modalities.length) % modalities.length];
        const severity = hash(id + 17);
        const level = severity > 0.93 ? 'critical' : severity > 0.72 ? 'high' : severity > 0.4 ? 'moderate' : 'low';
        flags.push({ id, level, modality, threat: threatByModality[modality] });
    }
    return flags;
}
const dominantByLevel = {
    safe: 0.09,
    low: 0.27,
    moderate: 0.57,
    high: 0.79,
    critical: 0.92
};
function tagsFor(modality, score, seed) {
    if (score < 0.35)
        return clearTags[modality];
    const pool = elevatedTags[modality];
    const first = pool[Math.floor(hash(seed) * pool.length) % pool.length];
    if (score < 0.7)
        return [first];
    const second = pool[Math.floor(hash(seed + 5) * pool.length) % pool.length];
    return second === first ? [first] : [first, second];
}
export function profileForChunk(chunk) {
    const primary = chunk.modality ?? 'visual';
    const signals = modalities.map((modality) => {
        const isPrimary = modality === primary && chunk.level !== 'safe';
        const jitter = (hash(chunk.id * 7 + modality.length) - 0.5) * 0.08;
        const raw = isPrimary ?
            dominantByLevel[chunk.level] + jitter :
            0.06 + hash(chunk.id * 13 + modality.length * 3) * 0.24;
        const score = Math.min(0.99, Math.max(0.01, Number(raw.toFixed(2))));
        return {
            modality,
            model: modelNames[modality],
            label: modalityLabels[modality],
            score,
            level: scoreToLevel(score),
            tags: tagsFor(modality, score, chunk.id * 3 + modality.length)
        };
    });
    const scores = signals.map((signal) => signal.score);
    const top = Math.max(...scores);
    const rest = (scores.reduce((sum, value) => sum + value, 0) - top) / 2;
    const composite = Number(Math.min(0.99, top * 0.9 + rest * 0.28).toFixed(2));
    const level = scoreToLevel(composite);
    const recommended = recommendAction(level, primary);
    const confidence = Number(Math.min(0.99, 0.78 + composite * 0.18).toFixed(2));
    return {
        chunkId: chunk.id,
        composite,
        level,
        primary,
        threat: chunk.threat ?? 'No policy violation',
        signals,
        recommended,
        confidence,
        reason: reasonFor(chunk, level, primary)
    };
}
export function recommendAction(level, primary) {
    if (level === 'critical')
        return 'block';
    if (level === 'high')
        return primary === 'visual' ? 'blur' : 'mute';
    if (level === 'moderate')
        return 'flag';
    return 'allow';
}
function reasonFor(chunk, level, primary) {
    const window = `${formatTimecode(chunk.start)} – ${formatTimecode(chunk.end)}`;
    if (level === 'safe' || level === 'low') {
        return `No policy violation detected in chunk #${chunk.id} (${window}). All three modalities are below threshold.`;
    }
    const channel = primary === 'audio' ? 'Audio' : primary === 'text' ? 'Captions / STT' : 'Visual frames';
    return `${channel} contain inappropriate content at ${window}. Trigger: ${chunk.threat ?? threatByModality[primary]}.`;
}
export function buildEvent(chunk, profile, action, reviewed = false) {
    return {
        id: `chunk-${chunk.id}-${Math.round(chunk.start)}`,
        timecode: formatTimecode(chunk.start),
        chunkId: chunk.id,
        modality: profile.primary,
        threat: profile.threat,
        score: profile.composite,
        action,
        confidence: profile.confidence,
        reviewed,
        reason: profile.reason,
        signals: profile.signals
    };
}
export const riskLevelLabel = {
    safe: 'Safe',
    low: 'Low Risk',
    moderate: 'Moderate Risk',
    high: 'High Risk',
    critical: 'Critical Risk'
};
export const riskTextClass = {
    safe: 'text-low',
    low: 'text-low',
    moderate: 'text-moderate',
    high: 'text-high',
    critical: 'text-critical'
};
export const riskBadgeClass = {
    safe: 'bg-low/10 text-low ring-1 ring-inset ring-low/25',
    low: 'bg-low/10 text-low ring-1 ring-inset ring-low/25',
    moderate: 'bg-moderate/10 text-moderate ring-1 ring-inset ring-moderate/30',
    high: 'bg-high/10 text-high ring-1 ring-inset ring-high/30',
    critical: 'bg-critical/10 text-critical ring-1 ring-inset ring-critical/25'
};
export const riskBarClass = {
    safe: 'bg-low',
    low: 'bg-low',
    moderate: 'bg-moderate',
    high: 'bg-high',
    critical: 'bg-critical'
};
export const riskHex = {
    safe: '#10B981',
    low: '#10B981',
    moderate: '#F59E0B',
    high: '#F97316',
    critical: '#E11D48'
};
export const actionMeta = {
    allow: {
        label: 'Allow',
        short: 'Allowed',
        dot: 'bg-low',
        text: 'text-low',
        chip: 'bg-low/10 text-low ring-1 ring-inset ring-low/25',
        solid: 'bg-low text-white hover:bg-low/90'
    },
    flag: {
        label: 'Flag / Manual Review',
        short: 'Flagged',
        dot: 'bg-moderate',
        text: 'text-moderate',
        chip: 'bg-moderate/10 text-moderate ring-1 ring-inset ring-moderate/30',
        solid: 'bg-moderate text-white hover:bg-moderate/90'
    },
    mute: {
        label: 'Mute Audio',
        short: 'Audio muted',
        dot: 'bg-high',
        text: 'text-high',
        chip: 'bg-high/10 text-high ring-1 ring-inset ring-high/30',
        solid: 'bg-high text-white hover:bg-high/90'
    },
    blur: {
        label: 'Blur Video',
        short: 'Video blurred',
        dot: 'bg-blur',
        text: 'text-blur',
        chip: 'bg-blur/10 text-blur ring-1 ring-inset ring-blur/25',
        solid: 'bg-blur text-white hover:bg-blur/90'
    },
    block: {
        label: 'Block / Takedown',
        short: 'Blocked',
        dot: 'bg-critical',
        text: 'text-critical',
        chip: 'bg-critical/10 text-critical ring-1 ring-inset ring-critical/25',
        solid: 'bg-critical text-white hover:bg-critical/90'
    }
};
export const modalityShort = {
    visual: 'Visual',
    audio: 'Audio',
    text: 'Text'
};
export function scoreToLevel(score) {
    if (score >= 0.85)
        return 'critical';
    if (score >= 0.65)
        return 'high';
    if (score >= 0.4)
        return 'moderate';
    if (score >= 0.2)
        return 'low';
    return 'safe';
}
