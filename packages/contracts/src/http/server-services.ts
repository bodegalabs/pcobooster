/**
 * What the server middlewares provide, by name. The services are API-internal and cannot be
 * imported here, so `packages/api/src/http/services.ts` fills this interface by module
 * augmentation. Browser and Expo builds never see the augmentation, so the middleware tags'
 * `provides` is `never` there, which clients do not use. If the augmentation is missing on the
 * server, handler layers keep their requirements and the Worker fails to typecheck: the mistake
 * fails closed.
 */
export interface ServerServices {
  /** Never set; marks the interface as an augmentation point. */
  readonly augmentedBy?: "@pcobooster/api";
}

export type ProvidedBy<Key extends string> = Key extends keyof ServerServices
  ? ServerServices[Key]
  : never;
