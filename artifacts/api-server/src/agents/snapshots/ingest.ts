// Ingest feedback snapshot — for Plaud transcribe / paper-planner OCR / demo-feedback / sheets-sync feedback.

export async function captureIngestSnapshot(
  skill: string,
  sourceId: string,
  extra?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  // Most ingest feedback comes from external pipeline events. Caller passes
  // the relevant context (transcript, AI output, user correction) via `extra`.
  return {
    source_id: sourceId,
    ingest_skill: skill,
    raw_input: extra?.rawInput || null,
    ai_output: extra?.aiOutput || null,
    user_correction: extra?.userCorrection || null,
    matched_contact: extra?.matchedContact || null,
    similarity_score: extra?.similarityScore ?? null,
    extra: extra || null,
  };
}
