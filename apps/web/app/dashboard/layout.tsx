"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { UserButton } from "@clerk/nextjs"
import { LayoutDashboard, Plus } from "lucide-react"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen bg-zinc-950">
      <nav className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between sticky top-0 bg-zinc-950/95 backdrop-blur z-10">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="font-bold text-lg tracking-tight">
            <span className="text-indigo-400">Y</span>ANTRA
          </Link>
          <Link
            href="/dashboard"
            className={`flex items-center gap-2 text-sm transition-colors ${
              pathname === "/dashboard"
                ? "text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/run/new"
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New run
          </Link>
          <UserButton
            appearance={{
              variables: { colorPrimary: "#6366f1" },
            }}
          />
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}
