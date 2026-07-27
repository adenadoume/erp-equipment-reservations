import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Card, Col, Empty, Image, Input, Modal, Row, Select, Spin, Tag, Typography, message } from 'antd'
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
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
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [reserving, setReserving] = useState<Product | null>(null)
  const [syncing, setSyncing] = useState(false)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

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

  const visibleItems = filtered.slice(0, visibleCount)

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [search, category, supplier])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((c) => Math.min(c + PAGE_SIZE, filtered.length))
        }
      },
      { rootMargin: '400px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [filtered.length])

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

  return (
    <div>
      <Row gutter={12} style={{ marginBottom: 20 }}>
        <Col flex="auto">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Search code or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Col>
        <Col>
          <Select
            allowClear
            placeholder="Category"
            style={{ width: 200 }}
            value={category}
            onChange={(v) => setCategory(v ?? null)}
            options={categories.map((c) => ({ value: c, label: c }))}
          />
        </Col>
        <Col>
          <Select
            allowClear
            placeholder="Supplier"
            style={{ width: 160 }}
            value={supplier}
            onChange={(v) => setSupplier(v ?? null)}
            options={suppliers.map((s) => ({ value: s, label: s }))}
          />
        </Col>
        <Col>
          <Button icon={<ReloadOutlined />} onClick={confirmSync} loading={syncing}>
            Sync SoftOne stock
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
            {visibleItems.map((p) => (
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
          {visibleCount < filtered.length && (
            <div ref={sentinelRef} style={{ textAlign: 'center', padding: 24 }}>
              <Spin />
            </div>
          )}
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
