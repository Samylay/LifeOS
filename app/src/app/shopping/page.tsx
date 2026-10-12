"use client";

import { useState } from "react";
import { ShoppingBasket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterBar, Page, PageHeader } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingListPanel } from "@/components/shopping/shopping-list-panel";
import { PantryPanel } from "@/components/shopping/pantry-panel";
import { useShopping } from "@/lib/use-shopping";

export default function ShoppingPage() {
  const shopping = useShopping();
  const [tab, setTab] = useState<"list" | "pantry">("list");
  const open = shopping.entries.filter((e) => !e.checked).length;
  const inStock = shopping.pantry.filter((i) => i.inStock).length;

  return <Page narrow>
    <PageHeader title="Shopping" icon={ShoppingBasket} />
    <FilterBar aria-label="Shopping views">
      {([["list", "List", open], ["pantry", "Pantry", inStock]] as const).map(([value, label, count]) =>
        <Button key={value} variant={tab === value ? "secondary" : "ghost"} aria-pressed={tab === value} onClick={() => setTab(value)} className="min-h-10 flex-1">
          {label}<span className="ml-1 text-xs tabular-nums text-muted-foreground">{count}</span>
        </Button>)}
    </FilterBar>
    {shopping.error && !shopping.loading && shopping.entries.length === 0 && shopping.pantry.length === 0
      ? <p role="alert" className="text-sm text-muted-foreground">Could not load the list. It retries when you come back to this tab.</p>
      : shopping.loading
        ? <div className="flex flex-col gap-2"><Skeleton className="h-11" /><Skeleton className="h-36" /></div>
        : tab === "list" ? <ShoppingListPanel shopping={shopping} /> : <PantryPanel shopping={shopping} />}
  </Page>;
}
