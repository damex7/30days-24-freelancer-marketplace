import { DashShell } from "@/components/dash-shell";

export default function ClientLayout({ children }: LayoutProps<"/client">) {
  return <DashShell role="client">{children}</DashShell>;
}
