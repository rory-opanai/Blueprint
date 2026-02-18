"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/connectors", label: "Connectors" },
  { href: "/review", label: "Review Queue" },
  { href: "/audit", label: "Audit" },
  { href: "/walkthrough", label: "Walkthrough" }
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") {
    return pathname === "/dashboard" || pathname.startsWith("/deals/");
  }
  return pathname === href;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <aside className="side-nav">
        <div className="brand">
          <h1>Blueprint</h1>
          <p>TAS Command Center</p>
        </div>
        <nav className="nav-links">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link ${isActive(pathname, item.href) ? "nav-link-active" : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="meta">
          <strong>MVP mode</strong>
          <p>Salesforce is canonical. No auto-write without approval.</p>
        </div>
      </aside>
      <main>
        <div className="content-wrap">{children}</div>
      </main>
    </div>
  );
}
