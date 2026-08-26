import * as React from "react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Page({
  className,
  narrow = false,
  ...props
}: React.ComponentProps<"div"> & { narrow?: boolean }) {
  return (
    <div
      data-slot="page"
      className={cn("page", narrow && "page-narrow", className)}
      {...props}
    />
  )
}

interface PageHeaderProps extends Omit<React.ComponentProps<"header">, "title"> {
  title: React.ReactNode
  description?: React.ReactNode
  kicker?: React.ReactNode
  icon?: LucideIcon
  actions?: React.ReactNode
}

function PageHeader({
  title,
  description,
  kicker,
  icon: Icon,
  actions,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <header data-slot="page-header" className={cn("page-header enter", className)} {...props}>
      <div className="min-w-0">
        {kicker && <p className="page-kicker">{kicker}</p>}
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon && (
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-primary"
            >
              <Icon size={17} strokeWidth={1.9} />
            </span>
          )}
          <h1 className="min-w-0 text-balance text-foreground">{title}</h1>
        </div>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="page-actions shrink-0">{actions}</div>}
    </header>
  )
}

function SectionHeader({
  title,
  description,
  action,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div
      data-slot="section-header"
      className={cn("flex min-w-0 items-start justify-between gap-3", className)}
      {...props}
    >
      <div className="min-w-0">
        <h2 className="section-label">{title}</h2>
        {description && (
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

function FilterBar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="filter-bar"
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-1 rounded-xl border border-border bg-muted/50 p-1",
        className
      )}
      {...props}
    />
  )
}

export { FilterBar, Page, PageHeader, SectionHeader }
