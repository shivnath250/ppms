import { createContext, useContext, useEffect, useState } from 'react'
import { repo } from '../data/repository.js'

// Simulated auth. repo.authenticate checks a demo password against the seed
// user table; the "session" is just the chosen user persisted in localStorage.
// This is NOT secure auth and must never be described as such.
const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setUser(repo.getSession())
    setReady(true)
  }, [])

  async function login(email, password) {
    const u = await repo.authenticate(email, password)
    if (!u) return { ok: false, error: 'Invalid credentials. Use a demo account below.' }
    repo.setSession(u)
    setUser(u)
    return { ok: true, user: u }
  }

  function logout() {
    repo.setSession(null)
    setUser(null)
  }

  const isCorporate = user?.role === 'corporate'
  const isPlantHead = /plant head/i.test(user?.title || '')

  return (
    <AuthCtx.Provider value={{ user, ready, login, logout, isCorporate, isPlantHead }}>
      {children}
    </AuthCtx.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
