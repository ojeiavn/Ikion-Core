const ACTIVE_WORKSPACE_KEY = "ikion.activeWorkspaceId"

export function getActiveWorkspaceId() {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem(ACTIVE_WORKSPACE_KEY)
}

export function setActiveWorkspaceId(workspaceId: string) {
  window.localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspaceId)
}
