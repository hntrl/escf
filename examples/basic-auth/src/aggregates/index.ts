import { ESCF } from "escf/src";
import { UserAggregate } from "./user";

export const aggregates = ESCF.system.aggregates({
  user: UserAggregate,
});
