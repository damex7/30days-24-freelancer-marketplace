import { DashShell } from "@/components/dash-shell";

export default function FreelancerLayout({ children }: LayoutProps<"/freelancer">) {
  return <DashShell role="freelancer">{children}</DashShell>;
}
