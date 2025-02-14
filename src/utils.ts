import { z } from "zod";

export type InferType<T> = T extends z.ZodTypeAny ? z.infer<T> : never;
export type ArrayOrValue<T> = T | T[];
export type PromiseOrValue<T> = Promise<T> | T;

export const iife = <T>(fn: () => T): T => fn();
