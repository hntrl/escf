import type { Env } from "./env";

export type Bindings = Record<string, any>;
export type BindingsProvider<TBindings extends Bindings = Bindings> = (
  env: Env
) => TBindings;
export type ExtractBindings<TProvider extends BindingsProvider> =
  ReturnType<TProvider>;

export const bindings = <
  TBindings extends Bindings,
  TProvider extends BindingsProvider<TBindings>
>(
  provider: TProvider
): TProvider => provider;
