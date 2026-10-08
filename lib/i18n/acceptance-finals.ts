// Этапы «Заключение врача» / «Заключение психолога» (medical, medical_psych) —
// информационные: «approved»/«rejected» там значат «מתאימה» / «לא מתאימה
// (חוות דעת שלילית)», а не «принята/отклонена» в приёме. Поэтому для них
// исход берётся из acceptance_finals_medical.*, для остальных — acceptance_finals.*.
const MEDICAL_STAGES = new Set(['medical', 'medical_psych'])
const MEDICAL_FINALS = new Set(['approved', 'rejected'])

export function isMedicalFinal(stageCode: string | null | undefined, finalCode: string | null | undefined): boolean {
  return MEDICAL_STAGES.has(stageCode ?? '') && MEDICAL_FINALS.has(finalCode ?? '')
}

/** Ключ (в неймспейсе 'education') подписи исхода этапа приёма. */
export function acceptanceFinalKey(stageCode: string | null | undefined, finalCode: string): string {
  return isMedicalFinal(stageCode, finalCode)
    ? `acceptance_finals_medical.${finalCode}`
    : `acceptance_finals.${finalCode}`
}
