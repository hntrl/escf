import { ESCF } from "escf/index";
import { UserAggregate } from "./user";

export const aggregates = ESCF.system.aggregates({
  user: UserAggregate,
});
