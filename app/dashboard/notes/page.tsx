"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { 
  Search, 
  Plus, 
  StickyNote, 
  Calendar,
  MessageSquare,
  Video,
  FileText,
  MoreVertical,
  Trash2,
  Edit,
  Star,
  Sparkles
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const savedNotes = [
  {
    id: 1,
    title: "Critical Path Method - Complete Explanation",
    question: "Explain the Critical Path Method in project management",
    excerpt: "The Critical Path Method (CPM) is a project scheduling technique used to identify the longest sequence of dependent tasks...",
    date: "Feb 19, 2026",
    isStarred: true,
    hasVideo: true,
    citationCount: 3,
    tags: ["Scheduling", "CPM"],
  },
  {
    id: 2,
    title: "Kanban vs Scrum Comparison",
    question: "How do Kanban boards differ from Scrum?",
    excerpt: "While both Kanban and Scrum are agile methodologies, they differ significantly in their approach to work management...",
    date: "Feb 17, 2026",
    isStarred: true,
    hasVideo: true,
    citationCount: 4,
    tags: ["Agile", "Kanban", "Scrum"],
  },
  {
    id: 3,
    title: "Risk Register Components",
    question: "What are the key components of a risk register?",
    excerpt: "A risk register is a document that captures identified risks, their likelihood, potential impact, and mitigation strategies...",
    date: "Feb 15, 2026",
    isStarred: false,
    hasVideo: false,
    citationCount: 2,
    tags: ["Risk Management"],
  },
  {
    id: 4,
    title: "Stakeholder Analysis Techniques",
    question: "Describe different stakeholder analysis techniques",
    excerpt: "Stakeholder analysis involves identifying and assessing the influence and interest of individuals or groups...",
    date: "Feb 12, 2026",
    isStarred: false,
    hasVideo: true,
    citationCount: 2,
    tags: ["Stakeholders", "Planning"],
  },
  {
    id: 5,
    title: "Float Calculations Deep Dive",
    question: "How is float calculated in project scheduling?",
    excerpt: "Float (or slack) represents the amount of time an activity can be delayed without affecting the project completion date...",
    date: "Feb 10, 2026",
    isStarred: false,
    hasVideo: true,
    citationCount: 3,
    tags: ["Scheduling", "Float"],
  },
]

export default function NotesPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedNote, setSelectedNote] = useState(savedNotes[0])
  const [activeTab, setActiveTab] = useState("all")

  const filteredNotes = savedNotes.filter((note) => {
    const matchesSearch = 
      note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
    
    if (activeTab === "starred") return matchesSearch && note.isStarred
    return matchesSearch
  })

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Notes List */}
      <div className="w-full border-r border-border bg-background lg:w-96">
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="border-b border-border p-4">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-lg font-semibold">Notes</h1>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                New
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="mx-4 mt-4 grid w-auto grid-cols-2">
              <TabsTrigger value="all">All Notes</TabsTrigger>
              <TabsTrigger value="starred">Starred</TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1">
              <div className="p-4 space-y-2">
                {filteredNotes.map((note) => (
                  <button
                    key={note.id}
                    onClick={() => setSelectedNote(note)}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${
                      selectedNote?.id === note.id
                        ? "border-accent bg-accent/5"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {note.isStarred && (
                            <Star className="h-3.5 w-3.5 fill-accent text-accent shrink-0" />
                          )}
                          <h3 className="font-medium text-sm truncate">{note.title}</h3>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                          {note.excerpt}
                        </p>
                        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          <span>{note.date}</span>
                          {note.hasVideo && (
                            <>
                              <span className="text-border">|</span>
                              <Video className="h-3 w-3" />
                            </>
                          )}
                          <span className="text-border">|</span>
                          <FileText className="h-3 w-3" />
                          <span>{note.citationCount}</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {note.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}

                {filteredNotes.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <StickyNote className="h-10 w-10 text-muted-foreground/50" />
                    <p className="mt-3 text-sm text-muted-foreground">No notes found</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </Tabs>
        </div>
      </div>

      {/* Note Detail */}
      <div className="hidden flex-1 lg:block">
        {selectedNote ? (
          <ScrollArea className="h-full">
            <div className="p-8 max-w-3xl">
              {/* Note Header */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {selectedNote.isStarred && (
                      <Star className="h-5 w-5 fill-accent text-accent" />
                    )}
                    <h1 className="text-2xl font-bold">{selectedNote.title}</h1>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {selectedNote.date}
                    </span>
                    <span className="flex items-center gap-1">
                      <FileText className="h-4 w-4" />
                      {selectedNote.citationCount} sources
                    </span>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Star className="mr-2 h-4 w-4" />
                      {selectedNote.isStarred ? "Unstar" : "Star"}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Tags */}
              <div className="mt-4 flex flex-wrap gap-2">
                {selectedNote.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">{tag}</Badge>
                ))}
              </div>

              {/* Original Question */}
              <Card className="mt-6">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    Original Question
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{selectedNote.question}</p>
                </CardContent>
              </Card>

              {/* AI Answer */}
              <Card className="mt-4">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-accent" />
                    Orion's Answer
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <p>{selectedNote.excerpt}</p>
                    <p>
                      This is a saved note from your conversation with Orion. The full response includes detailed explanations, step-by-step breakdowns, and practical examples from your course materials.
                    </p>
                    <h4>Key Points:</h4>
                    <ul>
                      <li>Definition and core concepts</li>
                      <li>Practical application examples</li>
                      <li>Common pitfalls to avoid</li>
                      <li>Related topics for further study</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              {/* Citations */}
              <div className="mt-6">
                <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
                  <FileText className="h-4 w-4" />
                  Sources ({selectedNote.citationCount})
                </h3>
                <div className="grid gap-2">
                  <Card className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-chart-1/10">
                        <FileText className="h-4 w-4 text-chart-1" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Lecture 6, Slide 24</p>
                        <p className="text-xs text-muted-foreground">Critical Path Analysis</p>
                      </div>
                    </div>
                  </Card>
                  {selectedNote.hasVideo && (
                    <Card className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-chart-4/10">
                          <Video className="h-4 w-4 text-chart-4" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Lecture 6 Recording</p>
                          <p className="text-xs text-muted-foreground">Timestamp: 13:42</p>
                        </div>
                      </div>
                    </Card>
                  )}
                </div>
              </div>
            </div>
          </ScrollArea>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <StickyNote className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground">Select a note to view</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
