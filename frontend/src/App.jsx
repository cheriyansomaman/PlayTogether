import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { WSProvider } from './context/WSContext'
import ProtectedRoute from './components/ProtectedRoute'
import Navbar from './components/Navbar'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Events from './pages/Events'
import EventDetail from './pages/EventDetail'
import GameDetail from './pages/GameDetail'
import AdminUsers from './pages/AdminUsers'
import Profile from './pages/Profile'
import PublicEvent from './pages/PublicEvent'

function AppRoutes() {
  return (
    <Routes>
      {/* Public share page — no Navbar, no auth required */}
      <Route path="/share/:token" element={<PublicEvent />} />

      {/* All other routes — wrapped with Navbar */}
      <Route path="*" element={
        <div className="min-h-screen bg-slate-800">
          <Navbar />
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/events" element={<ProtectedRoute><Events /></ProtectedRoute>} />
              <Route path="/events/:id" element={<ProtectedRoute><EventDetail /></ProtectedRoute>} />
              <Route path="/games/:id" element={<ProtectedRoute><GameDetail /></ProtectedRoute>} />
              <Route path="/admin/users" element={<ProtectedRoute adminOnly><AdminUsers /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      } />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <WSProvider>
        <AppRoutes />
      </WSProvider>
    </AuthProvider>
  )
}
