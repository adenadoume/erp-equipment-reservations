import { useEffect, useState } from 'react'
import { Form, InputNumber, Modal, Select, message } from 'antd'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { triggerOrderSync } from '../lib/orderSync'
import { triggerReservationEmail } from '../lib/notifyReservation'
import { logReservationEvent } from '../lib/logEvent'
import type { Product, ProjectRow } from '../types'

export default function ReserveModal({
  product,
  onClose,
  onDone,
}: {
  product: Product
  onClose: () => void
  onDone: () => void
}) {
  const { session, profile } = useAuth()
  const [form] = Form.useForm()
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase
      .from('projects')
      .select('code, name')
      .order('code')
      .then(({ data }) => setProjects((data ?? []) as ProjectRow[]))
  }, [])

  async function handleAddProject(code: string) {
    const trimmed = code.trim()
    if (!trimmed) return
    const { error } = await supabase.from('projects').upsert({ code: trimmed, name: trimmed })
    if (error) {
      message.error(error.message)
      return
    }
    setProjects((prev) => (prev.some((p) => p.code === trimmed) ? prev : [...prev, { code: trimmed, name: trimmed }]))
  }

  async function onFinish(values: { project_code: string[]; quantity: number }) {
    const projectCode = values.project_code?.[0]
    if (!projectCode) return
    setSaving(true)
    const { data, error } = await supabase
      .from('reservations')
      .insert({
        product_code: product.kodikos,
        architect_id: session?.user.id ?? null,
        architect_name: profile?.full_name ?? session?.user.email ?? 'Unknown',
        project_code: projectCode,
        quantity: values.quantity,
        description: product.perigrafi,
        category: product.category,
      })
      .select()
      .single()
    setSaving(false)
    if (error) {
      message.error(error.message)
      return
    }
    message.success(`Reserved ${values.quantity} × ${product.kodikos}`)
    onDone()
    triggerOrderSync()
    if (data) triggerReservationEmail(data.id)
    logReservationEvent({
      action: 'create',
      architect_name: profile?.full_name ?? session?.user.email ?? 'Unknown',
      project_code: projectCode,
      product_code: product.kodikos,
      quantity: values.quantity,
    })
  }

  return (
    <Modal
      title={`ΔΕΣΜΕΥΣΗ — ${product.kodikos}`}
      open
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={saving}
      okText="Reserve"
    >
      <p style={{ color: '#999' }}>{product.perigrafi}</p>
      <p>
        Available: <strong style={{ color: product.available_qty <= 0 ? '#ff4d4f' : '#52c41a' }}>{product.available_qty}</strong>
      </p>
      <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ quantity: 1 }}>
        <Form.Item
          name="project_code"
          label="Project (OIK code)"
          rules={[{ required: true, message: 'Select or add a project' }]}
        >
          <Select
            showSearch
            mode="tags"
            maxCount={1}
            placeholder="Select or type a new project code"
            options={projects.map((p) => ({ value: p.code, label: p.code }))}
            filterOption={(input, option) =>
              (option?.label as string).toLowerCase().includes(input.toLowerCase())
            }
            onChange={(vals: string[]) => {
              const code = vals[vals.length - 1]
              if (code && !projects.some((p) => p.code === code)) {
                handleAddProject(code)
              }
            }}
          />
        </Form.Item>
        <Form.Item
          name="quantity"
          label="Quantity"
          rules={[{ required: true, type: 'number', min: 1, message: 'Enter a quantity' }]}
        >
          <InputNumber min={1} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
