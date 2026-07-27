export interface Product {
  kodikos: string
  perigrafi: string | null
  price: number | null
  stock_softone: number | null
  promitheftis: string | null
  category: string | null
  kathgoria: string | null
  photo_url: string | null
  container: string | null
  q: number
  reserved_qty: number
  available_qty: number
}

export interface Reservation {
  id: string
  product_code: string
  architect_id: string | null
  architect_name: string
  project_code: string
  quantity: number
  reservation_date: string
  description: string | null
  category: string | null
  edited_by: string | null
  created_at: string
  updated_at: string
}

export interface ProjectRow {
  code: string
  name: string | null
}

export interface Profile {
  id: string
  full_name: string
  role: 'architect' | 'admin'
}
