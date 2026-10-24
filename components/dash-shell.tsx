import { Suspense, type ReactNode } from "react";
import { DashNav, DashNavView } from "./dash-nav";

export function DashShell({ role, children }: { role: "client" | "freelancer"; children: ReactNode }) {
  return (
    <div className="lg:mx-auto lg:grid lg:max-w-[72rem] lg:px-6 lg:grid-cols-[14rem_1fr] lg:gap-8 lg:py-8">
      <div className="lg:sticky lg:top-6 lg:self-start">
        {/* usePathname() is request data, so the highlighted version streams in. */}
        <Suspense fallback={<DashNavView role={role} path={null} />}>
          <DashNav role={role} />
        </Suspense>
      </div>
      <div className="container-page min-w-0 py-6 lg:px-0 lg:py-0">{children}</div>
    </div>
  );
}
