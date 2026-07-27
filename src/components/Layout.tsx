import type { ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Avatar, Button, Space, Typography } from 'antd'
import { UserOutlined, LogoutOutlined } from '@ant-design/icons'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

export default function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile } = useAuth()

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#000' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 24px',
          borderBottom: '1px solid #222',
        }}
      >
        <Typography.Title level={4} style={{ margin: 0, color: '#fff' }}>
          Equipment Reservations
        </Typography.Title>
        <Space size="middle">
          <Button
            type={location.pathname === '/catalog' ? 'primary' : 'default'}
            onClick={() => navigate('/catalog')}
          >
            MASTER CATALOG
          </Button>
          <Button
            type={location.pathname === '/reservations' ? 'primary' : 'default'}
            onClick={() => navigate('/reservations')}
          >
            RESERVATIONS
          </Button>
          <Avatar icon={<UserOutlined />} />
          <Typography.Text style={{ color: '#fff' }}>{profile?.full_name}</Typography.Text>
          <Button type="text" icon={<LogoutOutlined />} onClick={handleLogout} style={{ color: '#fff' }} />
        </Space>
      </header>
      <main style={{ padding: 24 }}>{children}</main>
    </div>
  )
}
