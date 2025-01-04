export class RequestError extends Error {
  constructor(arg: any, public status: number = 400) {
    arg = typeof arg === "string" ? { message: arg } : arg;
    arg.status ??= status;
    status = arg.status;
    super(JSON.stringify(arg));
    this.name = "RequestError";
  }
  static unmarshal(arg: any) {
    const reqErr = new RequestError(arg);
    Object.assign(reqErr, JSON.parse(reqErr.message));
    return reqErr;
  }
}

export function castRpcError(err: Error) {
  const requestErrorParts = err.message.split("RequestError: ");
  if (requestErrorParts.length > 1) {
    return RequestError.unmarshal(JSON.parse(requestErrorParts[1]));
  }
  return err;
}

export function isRpcError(err: Error, eq: Record<string, any>) {
  err = castRpcError(err as Error);
  if (err.name === "RequestError") {
    return Object.entries(eq).every(([key, value]) => {
      // @ts-expect-error - RequestError properties are intentionally ambiguous
      return err[key] === value;
    });
  }
  return false;
}
