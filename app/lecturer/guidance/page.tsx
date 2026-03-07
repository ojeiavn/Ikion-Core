"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { 
  Plus, 
  Save, 
  Search,
  ChevronRight,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Trash2
} from "lucide-react"

const existingGuidance = [
  {
    id: 1,
    topic: "Critical Path Method",
    status: "complete",
    lastUpdated: "Feb 19, 2026",
  },
  {
    id: 2,
    topic: "Float Calculations",
    status: "complete",
    lastUpdated: "Feb 18, 2026",
  },
  {
    id: 3,
    topic: "Kanban vs Scrum",
    status: "draft",
    lastUpdated: "Feb 15, 2026",
  },
  {
    id: 4,
    topic: "Risk Register",
    status: "complete",
    lastUpdated: "Feb 12, 2026",
  },
  {
    id: 5,
    topic: "Stakeholder Analysis",
    status: "needs-review",
    lastUpdated: "Feb 10, 2026",
  },
]

export default function GuidanceEditorPage() {
  const [selectedTopic, setSelectedTopic] = useState(existingGuidance[0])
  const [searchQuery, setSearchQuery] = useState("")
  
  const [formData, setFormData] = useState({
    topic: "Critical Path Method",
    expectedStructure: `1. Define CPM and its purpose
2. Explain the calculation process (forward pass, backward pass)
3. Demonstrate float calculation
4. Identify the critical path
5. Discuss practical applications`,
    keyConcepts: "Critical path, Float (slack), Early start/finish, Late start/finish, Network diagram, Activity dependencies",
    exampleFragments: `"The critical path is the longest sequence of dependent activities..."
"Float represents the flexibility in scheduling non-critical activities..."
"To calculate the critical path, first identify all project activities and their dependencies..."`,
    commonMisconceptions: `- Confusing total float with free float
- Assuming all activities have float
- Forgetting that the critical path can change as the project progresses
- Miscalculating backward pass values`,
  })

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const filteredGuidance = existingGuidance.filter((g) =>
    g.topic.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Sidebar - Topic List */}
      <aside className="w-80 border-r border-border bg-background">
        <div className="flex h-full flex-col">
          <div className="border-b border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Answer Guidance</h2>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                New
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search topics..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-3 space-y-1">
              {filteredGuidance.map((guidance) => (
                <button
                  key={guidance.id}
                  onClick={() => setSelectedTopic(guidance)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    selectedTopic?.id === guidance.id
                      ? "border-accent bg-accent/5"
                      : "border-transparent hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{guidance.topic}</span>
                    {guidance.status === 'complete' && (
                      <CheckCircle2 className="h-4 w-4 text-chart-2" />
                    )}
                    {guidance.status === 'draft' && (
                      <Badge variant="secondary" className="text-xs">Draft</Badge>
                    )}
                    {guidance.status === 'needs-review' && (
                      <AlertCircle className="h-4 w-4 text-accent" />
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Updated {guidance.lastUpdated}
                  </p>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      </aside>

      {/* Main Editor */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 lg:p-8 max-w-4xl">
          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Lecturer Guidance Editor</h1>
              <p className="mt-1 text-muted-foreground">
                Define expected answers to influence Orion's responses
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="gap-2">
                <Sparkles className="h-4 w-4" />
                Preview
              </Button>
              <Button className="gap-2">
                <Save className="h-4 w-4" />
                Save Changes
              </Button>
            </div>
          </div>

          {/* Form */}
          <div className="space-y-6">
            {/* Topic */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Topic</CardTitle>
                <CardDescription>
                  The concept or question this guidance applies to
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Input
                  value={formData.topic}
                  onChange={(e) => handleInputChange("topic", e.target.value)}
                  placeholder="e.g., Critical Path Method"
                />
              </CardContent>
            </Card>

            {/* Expected Answer Structure */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Expected Answer Structure</CardTitle>
                <CardDescription>
                  How students should structure their answers to this topic
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={formData.expectedStructure}
                  onChange={(e) => handleInputChange("expectedStructure", e.target.value)}
                  placeholder="Outline the expected structure..."
                  className="min-h-[150px]"
                />
              </CardContent>
            </Card>

            {/* Key Concepts */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Key Concepts to Include</CardTitle>
                <CardDescription>
                  Essential terms and ideas students must cover
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={formData.keyConcepts}
                  onChange={(e) => handleInputChange("keyConcepts", e.target.value)}
                  placeholder="List key concepts separated by commas..."
                  className="min-h-[100px]"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  {formData.keyConcepts.split(',').map((concept, idx) => (
                    <Badge key={idx} variant="secondary">
                      {concept.trim()}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Example Fragments */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Example Answer Fragments</CardTitle>
                <CardDescription>
                  Sample phrases or explanations that demonstrate good answers
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={formData.exampleFragments}
                  onChange={(e) => handleInputChange("exampleFragments", e.target.value)}
                  placeholder="Add example answer fragments..."
                  className="min-h-[150px] font-mono text-sm"
                />
              </CardContent>
            </Card>

            {/* Common Misconceptions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Common Misconceptions</CardTitle>
                <CardDescription>
                  Mistakes students frequently make that Orion should address
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={formData.commonMisconceptions}
                  onChange={(e) => handleInputChange("commonMisconceptions", e.target.value)}
                  placeholder="List common misconceptions..."
                  className="min-h-[120px]"
                />
              </CardContent>
            </Card>

            {/* Preview Card */}
            <Card className="border-accent/30 bg-accent/5">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-accent" />
                  How This Affects Orion
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>
                  When students ask about <strong>{formData.topic}</strong>, Orion will:
                </p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Structure answers following your expected format</li>
                  <li>Emphasize the key concepts you've specified</li>
                  <li>Proactively address common misconceptions</li>
                  <li>Use your example fragments as reference for tone and depth</li>
                </ul>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-border">
              <Button variant="ghost" className="text-destructive gap-2">
                <Trash2 className="h-4 w-4" />
                Delete Guidance
              </Button>
              <div className="flex gap-3">
                <Button variant="outline">Cancel</Button>
                <Button className="gap-2">
                  <Save className="h-4 w-4" />
                  Save Changes
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
