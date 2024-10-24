import { ESCF } from "escf/index";
import { UserAggregate } from "./aggregates/user";
import { SessionService } from "./projections/sessions";
import { UserService } from "./projections/users";

export const aggregates = ESCF.system.aggregates({
  user: UserAggregate,
});

export const projections = ESCF.system.projections(aggregates, (env: Env) => ({
  users: UserService,
  sessions: SessionService,
}));

export const system = ESCF.system({
  aggregates,
  projections,
});
