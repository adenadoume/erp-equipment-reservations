import { message } from 'antd'

const ORDER_SYNC_URL = 'https://erp.agop.pro/api/equipment/sync-order'

/**
 * Fire-and-forget: ask softone-live-backend to reconcile SoftOne document
 * ΠΑΛ-ΑΝ0026's lines with the current reservations table. Best-effort —
 * Supabase is the source of truth, this is a background mirror. A failure
 * here (SoftOne is known to be flaky) surfaces a warning but never blocks
 * the reservation the user just made/edited/deleted.
 *
 * Re-enabled 2026-07-29 per explicit user go-ahead (was disabled 2026-07-27,
 * see erp-equipment-reservations-handoff.md section 4 for the full history).
 */
export function triggerOrderSync() {
  fetch(ORDER_SYNC_URL, { method: 'POST' })
    .then(async (resp) => {
      if (!resp.ok) throw new Error(`sync-order failed (${resp.status})`)
    })
    .catch(() => {
      message.warning('Reservation saved, but the SoftOne order sync failed — it will retry next time.')
    })
}
