import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Col, Empty, Image, Input, Modal, Pagination, Row, Select, Spin, Tag, Typography, message } from 'antd'
import { DownloadOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import type { Product } from '../types'
import ReserveModal from '../components/ReserveModal'

const PAGE_SIZE = 24
const SOFTONE_SYNC_URL = 'https://erp.agop.pro/api/equipment/sync-stock'

export default function Catalog() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [supplier, setSupplier] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [reserving, setReserving] = useState<Product | null>(null)
  const [syncing, setSyncing] = useState(false)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('product_availability')
      .select('*')
      .order('kodikos')
    if (error) message.error(error.message)
    setProducts((data ?? []) as Product[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort() as string[],
    [products],
  )
  const suppliers = useMemo(
    () => Array.from(new Set(products.map((p) => p.promitheftis).filter(Boolean))).sort() as string[],
    [products],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter((p) => {
      if (category && p.category !== category) return false
      if (supplier && p.promitheftis !== supplier) return false
      if (q && !(p.kodikos.toLowerCase().includes(q) || (p.perigrafi ?? '').toLowerCase().includes(q))) return false
      return true
    })
  }, [products, search, category, supplier])

  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  useEffect(() => {
    setPage(1)
  }, [search, category, supplier])

  async function runSync() {
    setSyncing(true)
    try {
      const resp = await fetch(SOFTONE_SYNC_URL, { method: 'POST' })
      if (!resp.ok) throw new Error(`Sync failed (${resp.status})`)
      const result = await resp.json()
      message.success(`SoftOne stock synced: ${result.updated_in_supabase} items`)
      await load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  function confirmSync() {
    Modal.confirm({
      title: 'Sync stock from SoftOne?',
      content: 'This refreshes stock_softone for the whole catalog from SoftOne. Are you sure?',
      okText: 'Sync',
      onOk: runSync,
    })
  }

  function downloadXlsx() {
    const rows = filtered.map((p) => ({
      'Κωδικός': p.kodikos,
      'Περιγραφή': p.perigrafi ?? '',
      'Προμηθευτής': p.promitheftis ?? '',
      'Κατηγορία': p.category ?? '',
      'Container': p.container ?? '',
      'Stock': p.q,
      'ΔΙΑΘΕΣΙΜΑ': p.available_qty,
      'ΛΙΑΝΙΚΗ ΜΕ ΦΠΑ': p.price ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Products')
    XLSX.writeFile(wb, `products_${dayjs().format('YYYY-MM-DD')}.xlsx`)
  }

  return (
    <div>
      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={24} md={8} lg={10}>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Search code or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Col>
        <Col xs={12} sm={8} md={4} lg={3}>
          <Select
            allowClear
            placeholder="Category"
            style={{ width: '100%' }}
            value={category}
            onChange={(v) => setCategory(v ?? null)}
            options={categories.map((c) => ({ value: c, label: c }))}
          />
        </Col>
        <Col xs={12} sm={8} md={4} lg={3}>
          <Select
            allowClear
            placeholder="Supplier"
            style={{ width: '100%' }}
            value={supplier}
            onChange={(v) => setSupplier(v ?? null)}
            options={suppliers.map((s) => ({ value: s, label: s }))}
          />
        </Col>
        <Col xs={12} sm={8} md={4} lg={4}>
          <Button icon={<ReloadOutlined />} onClick={confirmSync} loading={syncing} block>
            Sync SoftOne stock
          </Button>
        </Col>
        <Col xs={12} sm={8} md={4} lg={4}>
          <Button icon={<DownloadOutlined />} onClick={downloadXlsx} block>
            Download
          </Button>
        </Col>
      </Row>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
        </div>
      ) : filtered.length === 0 ? (
        <Empty description="No products match" />
      ) : (
        <>
          <Row gutter={[16, 16]}>
            {pageItems.map((p) => (
              <Col key={p.kodikos} xs={24} sm={12} md={8} lg={6} xl={6}>
                <Card
                  hoverable
                  cover={
                    p.photo_url ? (
                      <Image
                        src={p.photo_url}
                        alt={p.kodikos}
                        height={180}
                        style={{ objectFit: 'contain', background: '#111' }}
                        preview={false}
                      />
                    ) : (
                      <div style={{ height: 180, background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>
                        No image
                      </div>
                    )
                  }
                  actions={[
                    <a
                      key="reserve"
                      onClick={() => setReserving(p)}
                      style={{ color: p.available_qty <= 0 ? '#888' : '#2f54eb', fontWeight: 600 }}
                    >
                      ΔΕΣΜΕΥΣΗ
                    </a>,
                  ]}
                >
                  <Tag color="blue">{p.promitheftis}</Tag>
                  <Typography.Title level={5} style={{ margin: '8px 0 4px' }}>
                    {p.kodikos}
                  </Typography.Title>
                  <Typography.Paragraph
                    type="secondary"
                    ellipsis={{ rows: 2 }}
                    style={{ minHeight: 44, marginBottom: 8 }}
                  >
                    {p.perigrafi}
                  </Typography.Paragraph>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span>STOCK: {p.q}</span>
                    <span style={{ color: p.available_qty <= 0 ? '#ff4d4f' : '#52c41a' }}>
                      ΔΙΑΘΕΣΙΜΑ: {p.available_qty}
                    </span>
                  </div>
                  {p.price != null && (
                    <div style={{ marginTop: 4, fontSize: 13 }}>ΛΙΑΝΙΚΗ ΜΕ ΦΠΑ: {p.price}</div>
                  )}
                </Card>
              </Col>
            ))}
          </Row>
          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <Pagination
              current={page}
              pageSize={PAGE_SIZE}
              total={filtered.length}
              onChange={setPage}
              showSizeChanger={false}
              size="small"
              responsive
            />
          </div>
        </>
      )}

      {reserving && (
        <ReserveModal
          product={reserving}
          onClose={() => setReserving(null)}
          onDone={() => {
            setReserving(null)
            load()
          }}
        />
      )}
    </div>
  )
}
