import { ProtectedShell } from "@/components/protected-shell"

export default function LecturerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <ProtectedShell allowedRoles={["lecturer", "admin"]}>{children}</ProtectedShell>
}
