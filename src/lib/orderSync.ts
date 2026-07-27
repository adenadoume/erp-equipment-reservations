/**
 * Fire-and-forget: ask softone-live-backend to reconcile SoftOne document
 * ΠΑΛ-ΑΝ0026's lines with the current reservations table. Best-effort —
 * Supabase is the source of truth, this is a background mirror.
 *
 * DISABLED 2026-07-27 per explicit user instruction: some historical
 * reservations were already manually synced into SoftOne through other
 * means, and a bulk full-replace sync risks overwriting/duplicating that
 * work. Do NOT re-enable this (uncomment the fetch below) until the user
 * explicitly gives the go-ahead — see erp-equipment-reservations-handoff.md.
 */
export function triggerOrderSync() {
  // fetch('https://erp.agop.pro/api/equipment/sync-order', { method: 'POST' })
}
