"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
  Users,
  GraduationCap,
  UserCog,
  Shield,
  MoreVertical,
  Mail,
  Edit,
  Trash2,
  Download,
  Filter
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const users = [
  {
    id: 1,
    name: "Dr. Sarah Chen",
    email: "s.chen@university.ac.uk",
    role: "lecturer",
    department: "Business School",
    modules: ["PM301", "BA401"],
    lastActive: "2 hours ago",
    status: "active",
  },
  {
    id: 2,
    name: "James Wilson",
    email: "j.wilson@university.ac.uk",
    role: "student",
    department: "Computer Science",
    modules: ["CS201", "PM301"],
    lastActive: "1 hour ago",
    status: "active",
  },
  {
    id: 3,
    name: "Prof. Michael Roberts",
    email: "m.roberts@university.ac.uk",
    role: "lecturer",
    department: "Computer Science",
    modules: ["CS201"],
    lastActive: "5 hours ago",
    status: "active",
  },
  {
    id: 4,
    name: "Emily Thompson",
    email: "e.thompson@university.ac.uk",
    role: "student",
    department: "Business School",
    modules: ["PM301", "BA401", "EC101"],
    lastActive: "Yesterday",
    status: "active",
  },
  {
    id: 5,
    name: "David Park",
    email: "d.park@university.ac.uk",
    role: "admin",
    department: "IT Services",
    modules: [],
    lastActive: "3 hours ago",
    status: "active",
  },
  {
    id: 6,
    name: "Lisa Anderson",
    email: "l.anderson@university.ac.uk",
    role: "student",
    department: "Economics",
    modules: ["EC101"],
    lastActive: "3 days ago",
    status: "inactive",
  },
  {
    id: 7,
    name: "Dr. Robert Kim",
    email: "r.kim@university.ac.uk",
    role: "lecturer",
    department: "Economics",
    modules: ["EC101"],
    lastActive: "1 day ago",
    status: "active",
  },
]

const roleIcons = {
  student: GraduationCap,
  lecturer: UserCog,
  admin: Shield,
}

const roleColors = {
  student: "bg-chart-2/10 text-chart-2 border-chart-2/20",
  lecturer: "bg-accent/10 text-accent border-accent/20",
  admin: "bg-chart-5/10 text-chart-5 border-chart-5/20",
}

const stats = [
  { label: "Total Users", value: "2,847", icon: Users, description: "Across all modules" },
  { label: "Students", value: "2,654", icon: GraduationCap, description: "Active learners" },
  { label: "Lecturers", value: "186", icon: UserCog, description: "Course instructors" },
  { label: "Administrators", value: "7", icon: Shield, description: "System admins" },
]

export default function UsersPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedRole, setSelectedRole] = useState("all")
  const [selectedDepartment, setSelectedDepartment] = useState("all")

  const filteredUsers = users.filter((user) => {
    const matchesSearch = 
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesRole = selectedRole === "all" || user.role === selectedRole
    const matchesDepartment = selectedDepartment === "all" || user.department === selectedDepartment
    return matchesSearch && matchesRole && matchesDepartment
  })

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
          <p className="mt-1 text-muted-foreground">
            Manage students, lecturers, and administrators
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export
          </Button>
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Add User
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10">
                  <stat.icon className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">All Users</CardTitle>
              <CardDescription>
                A list of all users with access to Orion
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-64"
                />
              </div>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="student">Students</SelectItem>
                  <SelectItem value="lecturer">Lecturers</SelectItem>
                  <SelectItem value="admin">Admins</SelectItem>
                </SelectContent>
              </Select>
              <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  <SelectItem value="Business School">Business School</SelectItem>
                  <SelectItem value="Computer Science">Computer Science</SelectItem>
                  <SelectItem value="Economics">Economics</SelectItem>
                  <SelectItem value="IT Services">IT Services</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="hidden md:table-cell">Department</TableHead>
                  <TableHead className="hidden lg:table-cell">Modules</TableHead>
                  <TableHead className="hidden sm:table-cell">Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Last Active</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => {
                  const RoleIcon = roleIcons[user.role as keyof typeof roleIcons]
                  const roleColor = roleColors[user.role as keyof typeof roleColors]
                  
                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarFallback className="bg-muted text-sm">
                              {user.name.split(' ').map(n => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{user.name}</p>
                            <p className="text-xs text-muted-foreground">{user.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`gap-1.5 ${roleColor}`}>
                          <RoleIcon className="h-3 w-3" />
                          <span className="capitalize">{user.role}</span>
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        {user.department}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {user.modules.slice(0, 2).map((module) => (
                            <Badge key={module} variant="secondary" className="text-xs font-mono">
                              {module}
                            </Badge>
                          ))}
                          {user.modules.length > 2 && (
                            <Badge variant="secondary" className="text-xs">
                              +{user.modules.length - 2}
                            </Badge>
                          )}
                          {user.modules.length === 0 && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge 
                          variant="secondary" 
                          className={user.status === 'active' 
                            ? 'bg-chart-2/10 text-chart-2' 
                            : 'bg-muted text-muted-foreground'
                          }
                        >
                          {user.status === 'active' ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {user.lastActive}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit User
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Mail className="mr-2 h-4 w-4" />
                              Send Email
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive">
                              <Trash2 className="mr-2 h-4 w-4" />
                              Remove User
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {filteredUsers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 font-semibold">No users found</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Try adjusting your search or filters
              </p>
            </div>
          )}

          {/* Pagination */}
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {filteredUsers.length} of {users.length} users
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled>
                Previous
              </Button>
              <Button variant="outline" size="sm">
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
