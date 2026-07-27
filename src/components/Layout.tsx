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
      <header className="app-header">
        <Typography.Title level={4} style={{ margin: 0, color: '#fff', whiteSpace: 'nowrap' }}>
          <span className="app-title-full">Equipment Reservations</span>
          <span className="app-title-short">Equipment</span>
        </Typography.Title>
        <Space size="small" wrap>
          <Button
            size="small"
            type={location.pathname === '/catalog' ? 'primary' : 'default'}
            onClick={() => navigate('/catalog')}
          >
            <span className="nav-btn-full">MASTER CATALOG</span>
            <span className="nav-btn-short">CATALOG</span>
          </Button>
          <Button
            size="small"
            type={location.pathname === '/reservations' ? 'primary' : 'default'}
            onClick={() => navigate('/reservations')}
          >
            <span className="nav-btn-full">RESERVATIONS</span>
            <span className="nav-btn-short">RESERV.</span>
          </Button>
          <Avatar size="small" icon={<UserOutlined />} />
          <Typography.Text className="app-user-name" style={{ color: '#fff' }}>
            {profile?.full_name}
          </Typography.Text>
          <Button type="text" size="small" icon={<LogoutOutlined />} onClick={handleLogout} style={{ color: '#fff' }} />
        </Space>
      </header>
      <main className="app-main">{children}</main>
    </div>
  )
}
