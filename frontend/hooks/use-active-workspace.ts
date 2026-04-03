"use client"

import { useCallback, useEffect, useState } from "react"

import { getActiveWorkspaceId } from "@/lib/workspace-store"

export function useActiveWorkspaceId() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)

  const refreshWorkspaceId = useCallback(() => {
    setWorkspaceId(getActiveWorkspaceId())
  }, [])

  useEffect(() => {
    refreshWorkspaceId()

    const handleStorage = (event: StorageEvent) => {
      if (event.key === "orion.activeWorkspaceId") {
        refreshWorkspaceId()
      }
    }

    window.addEventListener("storage", handleStorage)
    return () => window.removeEventListener("storage", handleStorage)
  }, [refreshWorkspaceId])

  return { workspaceId, refreshWorkspaceId }
}
