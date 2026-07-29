const NOTIFY_URL = 'https://erp.agop.pro/api/equipment/notify-reservation'

/**
 * Fire-and-forget: email giorgos@palerosbay.com about a reservation create/edit.
 * Backend always sends "ARCHITECTS PDH RESERVATIONS"; if the change pushed that
 * product's ΔΙΑΘΕΣΙΜΑ below zero, it also sends a second "PDH ORDERS - ARCHITECTS
 * RESERVATIONS" alert. Best-effort — never blocks the reservation itself.
 */
export function triggerReservationEmail(reservationId: string) {
  fetch(NOTIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reservation_id: reservationId }),
  }).catch(() => {
    // best-effort — email failure shouldn't surface as a user-facing error
  })
}
