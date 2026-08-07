import clsx, { type ClassValue } from "clsx";

/** shadcn-compatible class helper; clsx is enough without tailwind-merge here. */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
