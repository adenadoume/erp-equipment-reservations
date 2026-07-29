const LOG_EVENT_URL = 'https://erp.agop.pro/api/equipment/log-event'

/**
 * Fire-and-forget: append a line to the persistent architect-action log on
 * softone-live-backend (survives redeploys, unlike Supabase's reservations
 * table which loses all trace of a row once deleted). Best-effort, never
 * blocks the reservation itself.
 */
export function logReservationEvent(event: {
  action: 'create' | 'edit' | 'delete'
  architect_name: string
  project_code: string
  product_code: string
  quantity: number
}) {
  fetch(LOG_EVENT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  }).catch(() => {
    // best-effort — logging failure shouldn't surface as a user-facing error
  })
}
