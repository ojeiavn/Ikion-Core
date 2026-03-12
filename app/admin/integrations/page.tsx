"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Link2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Settings,
  RefreshCw,
  ExternalLink,
  Database,
  Video,
  BookOpen,
  MessageSquare,
  Shield,
  Zap,
  Calendar,
  Users
} from "lucide-react"

const integrations = [
  {
    id: "panopto",
    name: "Panopto",
    description: "Lecture capture and video management platform",
    category: "video",
    status: "connected",
    lastSync: "2 hours ago",
    icon: Video,
    features: ["Auto-import recordings", "Transcript extraction", "Timestamp sync"],
    stats: { synced: 1245, pending: 3 },
  },
  {
    id: "moodle",
    name: "Moodle LMS",
    description: "Learning management system integration",
    category: "lms",
    status: "connected",
    lastSync: "4 hours ago",
    icon: BookOpen,
    features: ["Course sync", "Student enrollment", "Assignment data"],
    stats: { synced: 12, pending: 0 },
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    description: "Team collaboration and meeting recordings",
    category: "collaboration",
    status: "pending",
    lastSync: "Never",
    icon: MessageSquare,
    features: ["Meeting recordings", "Chat integration", "Calendar sync"],
    stats: { synced: 0, pending: 0 },
  },
  {
    id: "azure-ad",
    name: "Azure Active Directory",
    description: "Single sign-on and user management",
    category: "auth",
    status: "connected",
    lastSync: "1 hour ago",
    icon: Shield,
    features: ["SSO authentication", "User provisioning", "Group sync"],
    stats: { synced: 2847, pending: 0 },
  },
  {
    id: "canvas",
    name: "Canvas LMS",
    description: "Alternative learning management system",
    category: "lms",
    status: "disconnected",
    lastSync: "Never",
    icon: BookOpen,
    features: ["Course sync", "Grade passback", "Assignment data"],
    stats: { synced: 0, pending: 0 },
  },
  {
    id: "echo360",
    name: "Echo360",
    description: "Active learning and lecture capture",
    category: "video",
    status: "disconnected",
    lastSync: "Never",
    icon: Video,
    features: ["Video capture", "Interactive content", "Analytics"],
    stats: { synced: 0, pending: 0 },
  },
  {
    id: "openai",
    name: "OpenAI API",
    description: "AI model provider for Orion responses",
    category: "ai",
    status: "connected",
    lastSync: "Active",
    icon: Zap,
    features: ["GPT-4 Turbo", "Embeddings", "Fine-tuning"],
    stats: { synced: 45892, pending: 0 },
  },
  {
    id: "pinecone",
    name: "Pinecone",
    description: "Vector database for semantic search",
    category: "database",
    status: "connected",
    lastSync: "Active",
    icon: Database,
    features: ["Vector storage", "Semantic search", "Real-time indexing"],
    stats: { synced: 892456, pending: 12 },
  },
]

const categoryLabels: Record<string, string> = {
  video: "Video Platforms",
  lms: "Learning Management",
  collaboration: "Collaboration",
  auth: "Authentication",
  ai: "AI Services",
  database: "Data Storage",
}

const statusConfig = {
  connected: { 
    color: "bg-chart-2/10 text-chart-2 border-chart-2/20", 
    icon: CheckCircle2,
    label: "Connected"
  },
  pending: { 
    color: "bg-accent/10 text-accent border-accent/20", 
    icon: Clock,
    label: "Pending Setup"
  },
  disconnected: { 
    color: "bg-muted text-muted-foreground border-border", 
    icon: AlertCircle,
    label: "Not Connected"
  },
}

export default function IntegrationsPage() {
  const [selectedCategory, setSelectedCategory] = useState("all")

  const filteredIntegrations = selectedCategory === "all" 
    ? integrations 
    : integrations.filter(i => i.category === selectedCategory)

  const connectedCount = integrations.filter(i => i.status === "connected").length
  const pendingCount = integrations.filter(i => i.status === "pending").length

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">System Integrations</h1>
          <p className="mt-1 text-muted-foreground">
            Configure connections to external services and data sources
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Sync All
          </Button>
          <Button className="gap-2">
            <Link2 className="h-4 w-4" />
            Add Integration
          </Button>
        </div>
      </div>

      {/* Status Overview */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-chart-2/10">
                <CheckCircle2 className="h-6 w-6 text-chart-2" />
              </div>
              <div>
                <p className="text-2xl font-bold">{connectedCount}</p>
                <p className="text-sm text-muted-foreground">Connected</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10">
                <Clock className="h-6 w-6 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingCount}</p>
                <p className="text-sm text-muted-foreground">Pending Setup</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Zap className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">99.9%</p>
                <p className="text-sm text-muted-foreground">Uptime</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category Filter */}
      <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="mb-6">
        <TabsList className="h-auto flex-wrap gap-2 bg-transparent p-0">
          <TabsTrigger 
            value="all" 
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            All
          </TabsTrigger>
          <TabsTrigger 
            value="video"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            Video
          </TabsTrigger>
          <TabsTrigger 
            value="lms"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            LMS
          </TabsTrigger>
          <TabsTrigger 
            value="collaboration"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            Collaboration
          </TabsTrigger>
          <TabsTrigger 
            value="auth"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            Auth
          </TabsTrigger>
          <TabsTrigger 
            value="ai"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            AI Services
          </TabsTrigger>
          <TabsTrigger 
            value="database"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            Database
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Integrations Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {filteredIntegrations.map((integration) => {
          const status = statusConfig[integration.status as keyof typeof statusConfig]
          const StatusIcon = status.icon
          
          return (
            <Card key={integration.id} className="overflow-hidden">
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${
                      integration.status === 'connected' ? 'bg-accent/10' : 'bg-muted'
                    }`}>
                      <integration.icon className={`h-5 w-5 ${
                        integration.status === 'connected' ? 'text-accent' : 'text-muted-foreground'
                      }`} />
                    </div>
                    <div>
                      <CardTitle className="text-base">{integration.name}</CardTitle>
                      <Badge variant="outline" className="mt-1 text-xs font-normal">
                        {categoryLabels[integration.category]}
                      </Badge>
                    </div>
                  </div>
                  <Badge variant="outline" className={`gap-1.5 ${status.color}`}>
                    <StatusIcon className="h-3 w-3" />
                    {status.label}
                  </Badge>
                </div>
                <CardDescription className="mt-3">
                  {integration.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Features */}
                <div className="flex flex-wrap gap-1.5">
                  {integration.features.map((feature) => (
                    <Badge key={feature} variant="secondary" className="text-xs font-normal">
                      {feature}
                    </Badge>
                  ))}
                </div>

                {/* Stats */}
                {integration.status === 'connected' && (
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground">
                      Last sync: <span className="text-foreground">{integration.lastSync}</span>
                    </span>
                    {integration.stats.synced > 0 && (
                      <span className="text-muted-foreground">
                        Items: <span className="text-foreground">{integration.stats.synced.toLocaleString()}</span>
                      </span>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  {integration.status === 'connected' ? (
                    <>
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <Settings className="h-3.5 w-3.5" />
                        Configure
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <RefreshCw className="h-3.5 w-3.5" />
                        Sync
                      </Button>
                    </>
                  ) : integration.status === 'pending' ? (
                    <Button size="sm" className="gap-1.5">
                      <Settings className="h-3.5 w-3.5" />
                      Complete Setup
                    </Button>
                  ) : (
                    <Button size="sm" className="gap-1.5">
                      <Link2 className="h-3.5 w-3.5" />
                      Connect
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="gap-1.5 ml-auto">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Docs
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* API Settings Section */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-base">API Configuration</CardTitle>
          <CardDescription>
            Manage API keys and webhook endpoints for system integrations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="webhook-url">Webhook URL</Label>
              <div className="flex gap-2">
                <Input 
                  id="webhook-url" 
                  value="https://orion.university.ac.uk/api/webhooks" 
                  readOnly 
                  className="font-mono text-sm"
                />
                <Button variant="outline" size="icon">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Use this URL to receive events from external systems
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="api-key">API Key</Label>
              <div className="flex gap-2">
                <Input 
                  id="api-key" 
                  type="password" 
                  value="sk_live_xxxxxxxxxxxxxxxxxxxxx" 
                  readOnly 
                  className="font-mono text-sm"
                />
                <Button variant="outline">Regenerate</Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Keep this key secure. Do not share publicly.
              </p>
            </div>
          </div>

          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="font-medium">Rate Limiting</p>
                <p className="text-sm text-muted-foreground">
                  Limit API requests to prevent abuse
                </p>
              </div>
              <Switch defaultChecked />
            </div>
          </div>

          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="font-medium">Auto-sync Schedule</p>
                <p className="text-sm text-muted-foreground">
                  Automatically sync integrations every 4 hours
                </p>
              </div>
              <Switch defaultChecked />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
