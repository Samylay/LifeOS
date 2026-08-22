"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Shared animated nav active-indicator (UI-MODERN-SPEC M5/U5, 2026-08-22).
 *
 * A single pill that slides between nav items using transform only
 * (200ms custom ease — no layout properties, interaction-craft compliant;
 * reduced-motion collapses it via the global block in globals.css).
 *
 * USAGE (sidebar / bottom-nav owners — not wired here by design):
 *
 *   const listRef = useRef<HTMLUListElement>(null);
 *   const [activeIndex, setActiveIndex] = useState(0); // derive from pathname
 *
 *   <ul ref={listRef} className="relative">
 *     <NavIndicator
 *       containerRef={listRef}
 *       activeIndex={activeIndex}
 *       orientation="vertical" // "horizontal" for bottom-nav
 *     />
 *     {items.map((item, i) => (
 *       <li
 *         key={item.href}
 *         ref={(el) => { itemRefs.current[i] = el; }}
 *         data-active={i === activeIndex || undefined}
 *       >
 *         <Link href={item.href}>…</Link>
 *       </li>
 *     ))}
 *   </ul>
 *
 * The indicator measures the active item's offset within the container
 * (offsetTop/offsetLeft + offsetHeight/offsetWidth) and positions itself
 * with translate3d, so moving between items animates as one transform.
 * It re-measures on resize and on font load via ResizeObserver on both
 * the container and the active item.
 */

interface NavIndicatorProps {
  /** The positioned (<ul>/<nav>) ancestor containing the nav items. Must be
   *  `relative` and its direct children the items. */
  containerRef: React.RefObject<HTMLElement | null>
  /** Index of the active item among the container's element children. */
  activeIndex: number
  /** Slide axis. vertical = sidebar, horizontal = bottom-nav. */
  orientation?: "vertical" | "horizontal"
  className?: string
}

export function NavIndicator({
  containerRef,
  activeIndex,
  orientation = "vertical",
  className,
}: NavIndicatorProps) {
  const indicatorRef = React.useRef<HTMLSpanElement>(null)

  React.useEffect(() => {
    const container = containerRef.current
    const indicator = indicatorRef.current
    if (!container || !indicator) return

    const position = () => {
      const item = container.children[activeIndex] as HTMLElement | undefined
      if (!item) return
      const vertical = orientation === "vertical"
      const size = vertical ? item.offsetHeight : item.offsetWidth
      const offset = vertical ? item.offsetTop : item.offsetLeft
      if (vertical) {
        indicator.style.height = `${size}px`
        indicator.style.width = ""
      } else {
        indicator.style.width = `${size}px`
        indicator.style.height = ""
      }
      indicator.style.transform = vertical
        ? `translate3d(0, ${offset}px, 0)`
        : `translate3d(${offset}px, 0, 0)`
      indicator.style.opacity = "1"
    }

    position()
    const ro = new ResizeObserver(position)
    ro.observe(container)
    if (container.children[activeIndex] instanceof Element) {
      ro.observe(container.children[activeIndex] as Element)
    }
    return () => ro.disconnect()
  }, [containerRef, activeIndex, orientation])

  return (
    <span
      ref={indicatorRef}
      aria-hidden="true"
      data-slot="nav-indicator"
      className={cn(
        "pointer-events-none absolute left-0 top-0 rounded-md bg-accent-ui opacity-0 will-change-transform",
        "transition-[transform] duration-200 ease-(--ease-in-out-custom)",
        orientation === "vertical" ? "inset-x-0" : "inset-y-0",
        className
      )}
    />
  )
}
