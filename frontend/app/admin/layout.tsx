import { ProtectedShell } from "@/components/protected-shell"

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <ProtectedShell allowedRoles={["admin"]}>{children}</ProtectedShell>
}
