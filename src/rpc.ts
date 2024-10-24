export class RequestError extends Error {
  constructor(arg: any, public status: number = 400) {
    arg = typeof arg === "string" ? { message: arg } : arg;
    arg.status ??= status;
    status = arg.status;
    super(JSON.stringify(arg));
    this.name = "RequestError";
  }
}

export function castRpcError(err: Error) {
  const requestErrorParts = err.message.split("RequestError: ");
  if (requestErrorParts.length > 1) {
    return new RequestError(JSON.parse(requestErrorParts[1]));
  }
  return err;
}
