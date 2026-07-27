import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Spin } from 'antd'
import { AuthProvider, useAuth } from './lib/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Catalog from './pages/Catalog'
import Reservations from './pages/Reservations'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    )
  }
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

function Routed() {
  const { session } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/catalog" replace /> : <Login />} />
      <Route
        path="/catalog"
        element={
          <RequireAuth>
            <Layout>
              <Catalog />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/reservations"
        element={
          <RequireAuth>
            <Layout>
              <Reservations />
            </Layout>
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/catalog" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routed />
      </AuthProvider>
    </BrowserRouter>
  )
}
