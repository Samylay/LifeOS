"use client";

import * as React from "react";
import { Slot } from "radix-ui";
import { Button as MiraButton, buttonVariants } from "./mira/button";
import { cn } from "@/lib/utils";

// Existing feature links use asChild; new compositions use Base UI's render.
function Button({ asChild = false, className, variant, size, ...props }:
  React.ComponentProps<typeof MiraButton> & { asChild?: boolean }) {
  if (asChild) {
    return <Slot.Root data-slot="button" className={cn(buttonVariants({ variant, size }), className)}
      {...props as React.ComponentProps<typeof Slot.Root>} />;
  }
  return <MiraButton className={className} variant={variant} size={size} {...props} />;
}
export { Button, buttonVariants };
