export const chunkSeconds = 2;
export const simulationDurationSeconds = 180;
export const simulationStartSeconds = 84;
export const streamPosterUrl = "/81a43bff-0c55-4e29-a404-e979515676b1.jpg";
export const moderator = {
    initials: 'AA',
    name: 'Anish Amanagi',
    role: 'Security Moderator / MLOps Lead'
};
export const modelNames = {
    visual: 'Vision Model',
    audio: 'Audio Model',
    text: 'Text Model'
};
export const modalityLabels = {
    visual: 'Visual Risk',
    audio: 'Speech Risk',
    text: 'Caption / STT Toxicity'
};
export const clearTags = {
    visual: ['Safe imagery', 'No violence'],
    audio: ['Neutral tone', 'No profanity'],
    text: ['Clean captions']
};
export const elevatedTags = {
    visual: ['Violence', 'Graphic frame', 'Weapon detected', 'Suggestive imagery'],
    audio: ['Harmful language', 'Abusive speech', 'Threatening tone', 'Slur detected'],
    text: ['Toxicity detected', 'Harassment', 'Hate keyword', 'Profanity chip']
};
export const threatByModality = {
    visual: 'Graphic visual content',
    audio: 'Harmful speech',
    text: 'Toxic captions'
};
export const simulationFlags = [
    { id: 7, level: 'low', modality: 'visual', threat: 'Low-light frame' },
    { id: 12, level: 'moderate', modality: 'text', threat: 'Toxicity in captions' },
    { id: 13, level: 'low', modality: 'text', threat: 'Toxicity in captions' },
    { id: 21, level: 'high', modality: 'audio', threat: 'Abusive speech' },
    { id: 22, level: 'moderate', modality: 'audio', threat: 'Abusive speech' },
    { id: 29, level: 'low', modality: 'visual', threat: 'Rapid scene change' },
    { id: 34, level: 'moderate', modality: 'text', threat: 'Harassment phrasing' },
    { id: 38, level: 'high', modality: 'audio', threat: 'Threatening tone' },
    { id: 41, level: 'high', modality: 'audio', threat: 'Abusive speech' },
    { id: 42, level: 'high', modality: 'text', threat: 'Toxicity detected' },
    { id: 43, level: 'critical', modality: 'audio', threat: 'Harmful speech' },
    { id: 44, level: 'high', modality: 'audio', threat: 'Abusive speech' },
    { id: 51, level: 'moderate', modality: 'text', threat: 'Toxicity detected' },
    { id: 58, level: 'low', modality: 'visual', threat: 'Crowd density' },
    { id: 63, level: 'high', modality: 'audio', threat: 'Abusive speech' },
    { id: 64, level: 'moderate', modality: 'audio', threat: 'Raised aggression' },
    { id: 71, level: 'moderate', modality: 'text', threat: 'Slur candidate' },
    { id: 78, level: 'low', modality: 'visual', threat: 'Motion blur' },
    { id: 84, level: 'high', modality: 'audio', threat: 'Harmful speech' }
];
export const moderationActions = [
    { key: 'allow', label: 'Allow', description: 'Publish chunk with no intervention' },
    { key: 'flag', label: 'Flag / Manual Review', description: 'Queue for a human moderator' },
    { key: 'mute', label: 'Mute Audio', description: 'Suppress the audio track for this chunk' },
    { key: 'blur', label: 'Blur Video', description: 'Apply frame blur to the visual channel' },
    { key: 'block', label: 'Block / Takedown', description: 'Terminate playback and notify owner' }
];
