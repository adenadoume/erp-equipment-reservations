import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Image, Input, InputNumber, Popconfirm, Select, Space, Spin, Table, Typography, message } from 'antd'
import { DownloadOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { triggerOrderSync } from '../lib/orderSync'
import type { Reservation } from '../types'

type Row = Reservation & { product?: { photo_url: string | null } | null }

const PAGE_SIZE = 20

export default function Reservations() {
  const { profile, session, isAdmin } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState<string | null>(null)
  const [architectFilter, setArchitectFilter] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editQty, setEditQty] = useState<number>(1)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('reservations')
      .select('*, product:products(photo_url)')
      .order('created_at', { ascending: false })
    if (error) message.error(error.message)
    setRows((data ?? []) as Row[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const projects = useMemo(() => Array.from(new Set(rows.map((r) => r.project_code))).sort(), [rows])
  const architects = useMemo(() => Array.from(new Set(rows.map((r) => r.architect_name))).sort(), [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (projectFilter && r.project_code !== projectFilter) return false
      if (architectFilter && r.architect_name !== architectFilter) return false
      if (
        q &&
        !(
          r.product_code.toLowerCase().includes(q) ||
          (r.description ?? '').toLowerCase().includes(q)
        )
      )
        return false
      return true
    })
  }, [rows, search, projectFilter, architectFilter])

  const visibleRows = filtered.slice(0, visibleCount)

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [search, projectFilter, architectFilter])

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

  function canEdit(row: Row) {
    return isAdmin || row.architect_id === session?.user.id
  }

  async function saveEdit(row: Row) {
    const { error } = await supabase
      .from('reservations')
      .update({ quantity: editQty, edited_by: profile?.full_name ?? session?.user.email ?? null })
      .eq('id', row.id)
    if (error) {
      message.error(error.message)
      return
    }
    setEditingId(null)
    load()
    triggerOrderSync()
  }

  async function deleteRow(id: string) {
    const { error } = await supabase.from('reservations').delete().eq('id', id)
    if (error) {
      message.error(error.message)
      return
    }
    message.success('Deleted')
    load()
    triggerOrderSync()
  }

  function downloadCsv() {
    const header = ['Project', 'Architect', 'Code', 'Description', 'Category', 'Quantity', 'Date']
    const lines = filtered.map((r) =>
      [r.project_code, r.architect_name, r.product_code, r.description ?? '', r.category ?? '', r.quantity, r.reservation_date]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    )
    const csv = [header.join(','), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reservations_${dayjs().format('YYYY-MM-DD')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <Space style={{ marginBottom: 20 }} wrap>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Search code or description..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 260 }}
        />
        <Select
          allowClear
          placeholder="Project"
          style={{ width: 160 }}
          value={projectFilter}
          onChange={(v) => setProjectFilter(v ?? null)}
          options={projects.map((p) => ({ value: p, label: p }))}
        />
        <Select
          allowClear
          placeholder="Reserved by"
          style={{ width: 160 }}
          value={architectFilter}
          onChange={(v) => setArchitectFilter(v ?? null)}
          options={architects.map((a) => ({ value: a, label: a }))}
        />
        <Button icon={<DownloadOutlined />} onClick={downloadCsv}>
          Download
        </Button>
      </Space>

      <div style={{ overflowX: 'auto' }}>
        <Table<Row>
          rowKey="id"
          loading={loading}
          dataSource={visibleRows}
          pagination={false}
          scroll={{ x: 1100 }}
          columns={[
            {
              title: 'Photo',
              width: 170,
              render: (_, r) =>
                r.product?.photo_url ? (
                  <Image
                    src={r.product.photo_url}
                    width={150}
                    height={150}
                    style={{ objectFit: 'contain', background: '#111' }}
                  />
                ) : null,
            },
            { title: 'Project', dataIndex: 'project_code', width: 120, sorter: (a, b) => a.project_code.localeCompare(b.project_code) },
            { title: 'Architect', dataIndex: 'architect_name', width: 120 },
            { title: 'Code', dataIndex: 'product_code', width: 120 },
            { title: 'Description', dataIndex: 'description', width: 260, ellipsis: true },
            { title: 'Category', dataIndex: 'category', width: 140 },
            {
              title: 'Qty',
              dataIndex: 'quantity',
              width: 100,
              render: (_, r) =>
                editingId === r.id ? (
                  <InputNumber min={1} value={editQty} onChange={(v) => setEditQty(v ?? 1)} autoFocus />
                ) : (
                  r.quantity
                ),
            },
            {
              title: 'Date',
              dataIndex: 'reservation_date',
              width: 120,
              render: (v) => (v ? dayjs(v).format('D/M/YYYY') : ''),
            },
            {
              title: 'Actions',
              width: 160,
              fixed: 'right',
              render: (_, r) => {
                if (!canEdit(r)) return <Typography.Text type="secondary">—</Typography.Text>
                return editingId === r.id ? (
                  <Space>
                    <Button size="small" type="primary" onClick={() => saveEdit(r)}>
                      Save
                    </Button>
                    <Button size="small" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </Space>
                ) : (
                  <Space>
                    <Button
                      size="small"
                      type="primary"
                      onClick={() => {
                        setEditingId(r.id)
                        setEditQty(r.quantity)
                      }}
                    >
                      Edit
                    </Button>
                    <Popconfirm title="Delete this reservation?" onConfirm={() => deleteRow(r.id)}>
                      <Button size="small" danger>
                        Delete
                      </Button>
                    </Popconfirm>
                  </Space>
                )
              },
            },
          ]}
        />
      </div>
      {visibleCount < filtered.length && (
        <div ref={sentinelRef} style={{ textAlign: 'center', padding: 24 }}>
          <Spin />
        </div>
      )}
      <Typography.Text type="secondary">
        {visibleRows.length} of {filtered.length} reservations
      </Typography.Text>
    </div>
  )
}
