import { useEffect, useMemo, useState } from 'react'
import { Button, Image, Input, InputNumber, Popconfirm, Select, Space, Table, Typography, message } from 'antd'
import { DownloadOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import type { Reservation } from '../types'

type Row = Reservation & { product?: { photo_url: string | null } | null }

export default function Reservations() {
  const { profile, session } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState<string | null>(null)
  const [architectFilter, setArchitectFilter] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editQty, setEditQty] = useState<number>(1)

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
  }

  async function deleteRow(id: string) {
    const { error } = await supabase.from('reservations').delete().eq('id', id)
    if (error) {
      message.error(error.message)
      return
    }
    message.success('Deleted')
    load()
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

      <Table<Row>
        rowKey="id"
        loading={loading}
        dataSource={filtered}
        pagination={{ pageSize: 20 }}
        columns={[
          {
            title: 'Photo',
            width: 70,
            render: (_, r) =>
              r.product?.photo_url ? (
                <Image src={r.product.photo_url} width={48} height={48} style={{ objectFit: 'contain' }} />
              ) : null,
          },
          { title: 'Project', dataIndex: 'project_code', sorter: (a, b) => a.project_code.localeCompare(b.project_code) },
          { title: 'Architect', dataIndex: 'architect_name' },
          { title: 'Code', dataIndex: 'product_code' },
          { title: 'Description', dataIndex: 'description', ellipsis: true },
          { title: 'Category', dataIndex: 'category' },
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
            render: (v) => (v ? dayjs(v).format('D/M/YYYY') : ''),
          },
          {
            title: 'Actions',
            width: 160,
            render: (_, r) =>
              editingId === r.id ? (
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
              ),
          },
        ]}
      />
      <Typography.Text type="secondary">{filtered.length} reservations</Typography.Text>
    </div>
  )
}
