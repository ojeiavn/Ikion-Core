"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Search, Play, Clock, Calendar, Filter, ChevronRight } from "lucide-react"

const lectures = [
  {
    id: 1,
    title: "Introduction to Project Management",
    lectureNumber: 1,
    week: 1,
    duration: "52:34",
    date: "Jan 15, 2026",
    topics: ["Project lifecycle", "Stakeholders", "Project charter"],
    thumbnail: null,
    isWatched: true,
  },
  {
    id: 2,
    title: "Project Planning Fundamentals",
    lectureNumber: 2,
    week: 2,
    duration: "48:12",
    date: "Jan 22, 2026",
    topics: ["Work breakdown structure", "Scope management", "Requirements"],
    thumbnail: null,
    isWatched: true,
  },
  {
    id: 3,
    title: "Scheduling Basics: Gantt Charts",
    lectureNumber: 3,
    week: 3,
    duration: "55:07",
    date: "Jan 29, 2026",
    topics: ["Gantt charts", "Milestones", "Dependencies"],
    thumbnail: null,
    isWatched: true,
  },
  {
    id: 4,
    title: "Network Diagrams and PERT",
    lectureNumber: 4,
    week: 4,
    duration: "51:23",
    date: "Feb 5, 2026",
    topics: ["Network diagrams", "PERT analysis", "Activity sequencing"],
    thumbnail: null,
    isWatched: true,
  },
  {
    id: 5,
    title: "Resource Management",
    lectureNumber: 5,
    week: 5,
    duration: "49:45",
    date: "Feb 12, 2026",
    topics: ["Resource allocation", "Resource leveling", "Capacity planning"],
    thumbnail: null,
    isWatched: false,
  },
  {
    id: 6,
    title: "Critical Path Analysis",
    lectureNumber: 6,
    week: 6,
    duration: "58:19",
    date: "Feb 19, 2026",
    topics: ["Critical path method", "Float calculations", "Schedule compression"],
    thumbnail: null,
    isWatched: false,
  },
  {
    id: 7,
    title: "Risk Management Fundamentals",
    lectureNumber: 7,
    week: 7,
    duration: "54:32",
    date: "Feb 26, 2026",
    topics: ["Risk identification", "Risk assessment", "Risk register"],
    thumbnail: null,
    isWatched: false,
  },
  {
    id: 8,
    title: "Agile Project Management",
    lectureNumber: 8,
    week: 8,
    duration: "56:48",
    date: "Mar 5, 2026",
    topics: ["Scrum", "Kanban", "Sprint planning"],
    thumbnail: null,
    isWatched: false,
  },
]

const weeks = ["All Weeks", "Week 1", "Week 2", "Week 3", "Week 4", "Week 5", "Week 6", "Week 7", "Week 8"]
const topics = ["All Topics", "Scheduling", "Risk", "Agile", "Planning", "Resources"]

export default function LecturesPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedWeek, setSelectedWeek] = useState("All Weeks")
  const [selectedTopic, setSelectedTopic] = useState("All Topics")

  const filteredLectures = lectures.filter((lecture) => {
    const matchesSearch = 
      lecture.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lecture.topics.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
    const matchesWeek = selectedWeek === "All Weeks" || `Week ${lecture.week}` === selectedWeek
    return matchesSearch && matchesWeek
  })

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Lecture Explorer</h1>
        <p className="mt-1 text-muted-foreground">
          Browse and search through all lecture recordings
        </p>
      </div>

      {/* Search and Filters */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search lectures or topics..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select value={selectedWeek} onValueChange={setSelectedWeek}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Week" />
            </SelectTrigger>
            <SelectContent>
              {weeks.map((week) => (
                <SelectItem key={week} value={week}>
                  {week}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedTopic} onValueChange={setSelectedTopic}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Topic" />
            </SelectTrigger>
            <SelectContent>
              {topics.map((topic) => (
                <SelectItem key={topic} value={topic}>
                  {topic}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Lecture Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredLectures.map((lecture) => (
          <Card 
            key={lecture.id} 
            className="group overflow-hidden transition-all hover:border-accent/50 hover:shadow-lg hover:shadow-accent/5"
          >
            {/* Thumbnail */}
            <div className="relative aspect-video bg-muted">
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/10 to-accent/10">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background/90 shadow-lg transition-transform group-hover:scale-110">
                  <Play className="h-5 w-5 text-foreground ml-0.5" />
                </div>
              </div>
              <div className="absolute bottom-2 right-2 rounded bg-background/90 px-1.5 py-0.5 text-xs font-medium backdrop-blur">
                {lecture.duration}
              </div>
              {lecture.isWatched && (
                <div className="absolute left-2 top-2">
                  <Badge variant="secondary" className="text-xs">Watched</Badge>
                </div>
              )}
            </div>

            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-accent">Lecture {lecture.lectureNumber}</span>
                <span className="text-border">|</span>
                <Calendar className="h-3 w-3" />
                <span>{lecture.date}</span>
              </div>
              
              <h3 className="mt-2 font-semibold leading-tight line-clamp-2">
                {lecture.title}
              </h3>
              
              <div className="mt-3 flex flex-wrap gap-1.5">
                {lecture.topics.slice(0, 3).map((topic) => (
                  <span
                    key={topic}
                    className="rounded-md bg-muted px-2 py-0.5 text-xs"
                  >
                    {topic}
                  </span>
                ))}
              </div>

              <Button 
                variant="ghost" 
                size="sm" 
                className="mt-3 w-full justify-between"
              >
                <span>Watch Lecture</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {filteredLectures.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <Search className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="mt-4 font-semibold">No lectures found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Try adjusting your search or filters
          </p>
        </div>
      )}
    </div>
  )
}
