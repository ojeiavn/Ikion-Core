import { ProtectedShell } from "@/components/protected-shell"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <ProtectedShell allowedRoles={["student", "lecturer", "admin"]}>{children}</ProtectedShell>
}
