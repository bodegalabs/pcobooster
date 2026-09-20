export interface RpcContext {
  readonly request: Request;
  readonly requestId: string;
  readonly resHeaders?: Headers;
}
