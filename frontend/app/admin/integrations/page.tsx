"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function AdminIntegrationsPage() {
  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Integrations</h1>
        <p className="mt-1 text-muted-foreground">
          External system integrations are not wired yet in this local Ikion MVP.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current State</CardTitle>
          <CardDescription>
            The backend now supports local auth, sessions, workspaces, ingestion, retrieval, and insights.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          When you are ready, this page is where calendar, SSO, LMS, storage, and video platform integrations should be added.
        </CardContent>
      </Card>
    </div>
  )
}
