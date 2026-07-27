import { useEffect, useMemo, useState } from 'react'
import { Button, Col, Image, Input, InputNumber, Popconfirm, Row, Select, Space, Table, Tooltip, Typography, message } from 'antd'
import { DownloadOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { triggerOrderSync } from '../lib/orderSync'
import type { Reservation } from '../types'

type RowType = Reservation & {
  product?: { photo_url: string | null; q: number } | null
  available_qty?: number | null
}

export default function Reservations() {
  const { profile, session, isAdmin } = useAuth()
  const [rows, setRows] = useState<RowType[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState<string | null>(null)
  const [architectFilter, setArchitectFilter] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editQty, setEditQty] = useState<number>(1)

  async function load() {
    setLoading(true)
    const [resResp, availResp] = await Promise.all([
      supabase
        .from('reservations')
        .select('*, product:products(photo_url, q)')
        .order('created_at', { ascending: false }),
      supabase.from('product_availability').select('kodikos, available_qty'),
    ])
    if (resResp.error) message.error(resResp.error.message)
    const availMap = new Map((availResp.data ?? []).map((p) => [p.kodikos, p.available_qty]))
    const merged = (resResp.data ?? []).map((r) => ({
      ...r,
      available_qty: availMap.get(r.product_code) ?? null,
    }))
    setRows(merged as RowType[])
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

  function canEdit(row: RowType) {
    return isAdmin || row.architect_id === session?.user.id
  }

  async function saveEdit(row: RowType) {
    const { data, error } = await supabase
      .from('reservations')
      .update({ quantity: editQty, edited_by: profile?.full_name ?? session?.user.email ?? null })
      .eq('id', row.id)
      .select()
    if (error) {
      message.error(error.message)
      return
    }
    if (!data || data.length === 0) {
      message.error("Couldn't save — you don't have permission to edit this reservation (not yours, and you're not an admin).")
      return
    }
    setEditingId(null)
    load()
    triggerOrderSync()
  }

  async function deleteRow(id: string) {
    const { data, error } = await supabase.from('reservations').delete().eq('id', id).select()
    if (error) {
      message.error(error.message)
      return
    }
    if (!data || data.length === 0) {
      message.error("Couldn't delete — you don't have permission to delete this reservation (not yours, and you're not an admin).")
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
      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={24} md={10} lg={12}>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Search code or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Col>
        <Col xs={12} sm={8} md={5} lg={4}>
          <Select
            allowClear
            placeholder="Project"
            style={{ width: '100%' }}
            value={projectFilter}
            onChange={(v) => setProjectFilter(v ?? null)}
            options={projects.map((p) => ({ value: p, label: p }))}
          />
        </Col>
        <Col xs={12} sm={8} md={5} lg={4}>
          <Select
            allowClear
            placeholder="Reserved by"
            style={{ width: '100%' }}
            value={architectFilter}
            onChange={(v) => setArchitectFilter(v ?? null)}
            options={architects.map((a) => ({ value: a, label: a }))}
          />
        </Col>
        <Col xs={24} sm={8} md={4} lg={4}>
          <Button icon={<DownloadOutlined />} onClick={downloadCsv} block>
            Download
          </Button>
        </Col>
      </Row>

      <div style={{ overflowX: 'auto' }}>
        <Table<RowType>
          rowKey="id"
          loading={loading}
          dataSource={filtered}
          pagination={{ pageSize: 20, responsive: true, size: 'small' }}
          scroll={{ x: 1300 }}
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
            { title: 'Stock', width: 90, render: (_, r) => r.product?.q ?? '' },
            {
              title: 'ΔΙΑΘΕΣΙΜΑ',
              width: 110,
              render: (_, r) =>
                r.available_qty == null ? '' : (
                  <span style={{ color: r.available_qty <= 0 ? '#ff4d4f' : '#52c41a' }}>{r.available_qty}</span>
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
                if (!canEdit(r))
                  return (
                    <Tooltip title="Only the reservation's own architect or an admin can edit/delete this">
                      <Typography.Text type="secondary">Not yours</Typography.Text>
                    </Tooltip>
                  )
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
      <Typography.Text type="secondary">{filtered.length} reservations</Typography.Text>
    </div>
  )
}
