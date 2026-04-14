import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"

const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border border-oklch(0.922 0 0) px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current dark:border-oklch(1 0 0 / 10%)",
  {
    variants: {
      variant: {
        default: "bg-oklch(1 0 0) text-oklch(0.145 0 0) dark:bg-oklch(0.205 0 0) dark:text-oklch(0.985 0 0)",
        destructive:
          "bg-oklch(1 0 0) text-oklch(0.577 0.245 27.325) *:data-[slot=alert-description]:text-oklch(0.577 0.245 27.325)/90 [&>svg]:text-current dark:bg-oklch(0.205 0 0) dark:text-oklch(0.704 0.191 22.216) dark:*:data-[slot=alert-description]:text-oklch(0.704 0.191 22.216)/90",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight",
        className
      )}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "col-start-2 grid justify-items-start gap-1 text-sm text-oklch(0.556 0 0) [&_p]:leading-relaxed dark:text-oklch(0.708 0 0)",
        className
      )}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription }
