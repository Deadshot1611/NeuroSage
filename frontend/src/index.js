import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'

import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'

import WelcomePage from './pages/WelcomePage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import App from './App'
import ASDModule from './pages/ASDModule'
import DysgraphiaScreener from './services/dysgraphia'
import DisfluencyDetector from './services/speech_disorder'
import ReportsPage from './pages/ReportsPage'
import reportWebVitals from './reportWebVitals'

const root = ReactDOM.createRoot(document.getElementById('root'))
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || ''

root.render(
  <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/"       element={<WelcomePage />} />
          <Route path="/login"  element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />

          <Route path="/home" element={
            <ProtectedRoute><App /></ProtectedRoute>
          } />
          <Route path="/asd" element={
            <ProtectedRoute><ASDModule /></ProtectedRoute>
          } />
          <Route path="/dysgraphia" element={
            <ProtectedRoute><DysgraphiaScreener /></ProtectedRoute>
          } />
          <Route path="/services/dysgraphia" element={
            <Navigate to="/dysgraphia" replace />
          } />
          <Route path="/speech_disorder" element={
            <ProtectedRoute><DisfluencyDetector /></ProtectedRoute>
          } />
          <Route path="/reports" element={
            <ProtectedRoute><ReportsPage /></ProtectedRoute>
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </GoogleOAuthProvider>
)

reportWebVitals()
