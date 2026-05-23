"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"

import { IkionAuthSession, IkionSetupStatus, IkionUser, IkionUserRole, ikionFetch } from "@/lib/ikion-api"

interface AuthContextValue {
  user: IkionUser | null
  sessionId: string | null
  isLoading: boolean
  refreshSession: () => Promise<void>
  login: (email: string, password: string) => Promise<IkionUser>
  bootstrap: (fullName: string, email: string, password: string) => Promise<IkionUser>
  logout: () => Promise<void>
  getSetupStatus: () => Promise<IkionSetupStatus>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<IkionUser | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const applyAuthSession = (authSession: IkionAuthSession) => {
    setUser(authSession.user)
    setSessionId(authSession.session.id)
  }

  const refreshSession = async () => {
    try {
      const authSession = await ikionFetch<IkionAuthSession>("/auth/me")
      applyAuthSession(authSession)
    } catch {
      setUser(null)
      setSessionId(null)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void refreshSession()
  }, [])

  const login = async (email: string, password: string) => {
    await ikionFetch<IkionAuthSession>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    })
    const verifiedSession = await ikionFetch<IkionAuthSession>("/auth/me")
    applyAuthSession(verifiedSession)
    return verifiedSession.user
  }

  const bootstrap = async (fullName: string, email: string, password: string) => {
    await ikionFetch<IkionAuthSession>("/auth/bootstrap", {
      method: "POST",
      body: JSON.stringify({ full_name: fullName, email, password }),
    })
    const verifiedSession = await ikionFetch<IkionAuthSession>("/auth/me")
    applyAuthSession(verifiedSession)
    return verifiedSession.user
  }

  const logout = async () => {
    await ikionFetch("/auth/logout", {
      method: "POST",
    })
    setUser(null)
    setSessionId(null)
  }

  const getSetupStatus = async () => ikionFetch<IkionSetupStatus>("/auth/setup-status")

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      sessionId,
      isLoading,
      refreshSession,
      login,
      bootstrap,
      logout,
      getSetupStatus,
    }),
    [user, sessionId, isLoading]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider.")
  }
  return context
}

export function roleHomePath(role: IkionUserRole) {
  if (role === "admin") return "/admin"
  if (role === "lecturer") return "/lecturer"
  return "/dashboard"
}
