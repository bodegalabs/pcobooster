/** A write attempted through a read-only client; nothing was sent. */
export class PlanningCenterReadOnlyError extends Error {
  override readonly name = "PlanningCenterReadOnlyError";
  readonly method: string;
  readonly path: string;

  constructor(options: { method: string; path: string }) {
    super(
      `Planning Center ${options.method} ${options.path} blocked by a read-only client`
    );
    this.method = options.method;
    this.path = options.path;
  }
}
