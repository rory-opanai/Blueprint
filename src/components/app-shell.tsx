"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

const NAV_SECTIONS = [
  {
    label: "Command",
    items: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/walkthrough", label: "Walkthrough" }
    ]
  },
  {
    label: "Manage",
    items: [
      { href: "/connectors", label: "Connectors" },
      { href: "/review", label: "Review Queue" },
      { href: "/audit", label: "Audit" }
    ]
  }
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") {
    return pathname === "/dashboard" || pathname.startsWith("/deals/");
  }
  return pathname === href;
}

function currentLabel(pathname: string): string {
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (isActive(pathname, item.href)) return item.label;
    }
  }
  return "Dashboard";
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const label = currentLabel(pathname);

  return (
    <div className="app-shell">
      <aside className="side-nav">
        <div className="workspace-pill">
          <div className="workspace-avatar">B</div>
          <div className="workspace-meta">
            <strong>Blueprint</strong>
            <p>TAS Command Center</p>
          </div>
        </div>

        <nav className="nav-links">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} className="nav-section">
              <small>{section.label}</small>
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-link ${isActive(pathname, item.href) ? "nav-link-active" : ""}`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="meta">
          <strong>MVP mode</strong>
          <p>Salesforce is canonical. No auto-write without approval.</p>
        </div>
      </aside>

      <main>
        <header className="shell-header">
          <div>
            <small>Blueprint</small>
            <h2>{label}</h2>
          </div>
          <div className="shell-header-actions">
            <span className="header-chip">Rory</span>
            <span className="user-pill">R</span>
          </div>
        </header>
        <div className="content-wrap">{children}</div>
      </main>
    </div>
  );
}
