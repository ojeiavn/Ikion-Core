"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { 
  Search,
  Plus,
  Upload,
  FileText,
  Video,
  BookOpen,
  FileQuestion,
  CheckCircle2,
  Clock,
  Trash2,
  MoreVertical,
  Download,
  RefreshCw
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const materials = [
  {
    id: 1,
    name: "Lecture 1 - Introduction.pdf",
    type: "slides",
    size: "2.4 MB",
    status: "processed",
    uploadedAt: "Jan 15, 2026",
    chunks: 24,
  },
  {
    id: 2,
    name: "Lecture 1 Recording.mp4",
    type: "video",
    size: "856 MB",
    status: "processed",
    uploadedAt: "Jan 15, 2026",
    duration: "52:34",
    transcript: true,
  },
  {
    id: 3,
    name: "Chapter 1 - PM Fundamentals.pdf",
    type: "reading",
    size: "1.8 MB",
    status: "processed",
    uploadedAt: "Jan 14, 2026",
    chunks: 18,
  },
  {
    id: 4,
    name: "Lecture 8 Recording.mp4",
    type: "video",
    size: "912 MB",
    status: "processing",
    uploadedAt: "Mar 5, 2026",
    progress: 67,
  },
  {
    id: 5,
    name: "Past Exam 2025.pdf",
    type: "exam",
    size: "450 KB",
    status: "processed",
    uploadedAt: "Feb 28, 2026",
    chunks: 8,
  },
  {
    id: 6,
    name: "Lecture 2 - Planning.pdf",
    type: "slides",
    size: "3.1 MB",
    status: "processed",
    uploadedAt: "Jan 22, 2026",
    chunks: 32,
  },
]

const typeIcons = {
  slides: FileText,
  video: Video,
  reading: BookOpen,
  exam: FileQuestion,
}

const typeColors = {
  slides: "text-chart-1 bg-chart-1/10",
  video: "text-chart-4 bg-chart-4/10",
  reading: "text-chart-2 bg-chart-2/10",
  exam: "text-accent bg-accent/10",
}

export default function ModulesPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedModule, setSelectedModule] = useState("PM301")
  const [selectedType, setSelectedType] = useState("all")

  const filteredMaterials = materials.filter((material) => {
    const matchesSearch = material.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesType = selectedType === "all" || material.type === selectedType
    return matchesSearch && matchesType
  })

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Module Management</h1>
          <p className="mt-1 text-muted-foreground">
            Upload and manage course materials
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Sync All
          </Button>
          <Button className="gap-2">
            <Upload className="h-4 w-4" />
            Upload Materials
          </Button>
        </div>
      </div>

      {/* Module Selector */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Select value={selectedModule} onValueChange={setSelectedModule}>
                <SelectTrigger className="w-[280px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PM301">PM301: Project Management</SelectItem>
                  <SelectItem value="CS201">CS201: Data Structures</SelectItem>
                  <SelectItem value="BA401">BA401: Business Analytics</SelectItem>
                  <SelectItem value="EC101">EC101: Microeconomics</SelectItem>
                </SelectContent>
              </Select>
              <div className="hidden sm:block">
                <Badge variant="secondary">156 students</Badge>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-chart-2" />
                {materials.filter(m => m.status === 'processed').length} processed
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-accent" />
                {materials.filter(m => m.status === 'processing').length} processing
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Materials Section */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Course Materials</CardTitle>
              <CardDescription>
                Slides, videos, readings, and exam papers
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search materials..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-64"
                />
              </div>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="slides">Slides</SelectItem>
                  <SelectItem value="video">Videos</SelectItem>
                  <SelectItem value="reading">Readings</SelectItem>
                  <SelectItem value="exam">Exams</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredMaterials.map((material) => {
              const Icon = typeIcons[material.type as keyof typeof typeIcons]
              const colorClass = typeColors[material.type as keyof typeof typeColors]
              
              return (
                <div
                  key={material.id}
                  className="flex items-center gap-4 rounded-lg border border-border p-4"
                >
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${colorClass}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{material.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="capitalize">{material.type}</span>
                      <span className="text-border">|</span>
                      <span>{material.size}</span>
                      <span className="text-border">|</span>
                      <span>{material.uploadedAt}</span>
                      {material.chunks && (
                        <>
                          <span className="text-border">|</span>
                          <span>{material.chunks} chunks</span>
                        </>
                      )}
                      {material.duration && (
                        <>
                          <span className="text-border">|</span>
                          <span>{material.duration}</span>
                        </>
                      )}
                    </div>
                    {material.status === 'processing' && material.progress && (
                      <div className="mt-2 flex items-center gap-2">
                        <Progress value={material.progress} className="h-1.5 flex-1" />
                        <span className="text-xs text-muted-foreground">{material.progress}%</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {material.status === 'processed' ? (
                      <Badge variant="secondary" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Processed
                      </Badge>
                    ) : (
                      <Badge className="gap-1 bg-accent">
                        <Clock className="h-3 w-3 animate-spin" />
                        Processing
                      </Badge>
                    )}
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <Download className="mr-2 h-4 w-4" />
                          Download
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Reprocess
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              )
            })}

            {filteredMaterials.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-4 font-semibold">No materials found</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try adjusting your search or filters
                </p>
              </div>
            )}
          </div>

          {/* Upload Zone */}
          <div className="mt-6 rounded-lg border-2 border-dashed border-border p-8 text-center">
            <Upload className="mx-auto h-10 w-10 text-muted-foreground" />
            <h3 className="mt-4 font-semibold">Drop files here to upload</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Supports PDF, PPTX, MP4, and DOCX files
            </p>
            <Button variant="outline" className="mt-4">
              Select Files
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
