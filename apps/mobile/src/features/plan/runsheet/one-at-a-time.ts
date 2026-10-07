/** Runs one task at a time and drops taps while it runs (Swift `isCreatingBasicItem`). */
export class OneAtATime {
  private running = false;
  private readonly changed: (running: boolean) => void;
  constructor(changed: (running: boolean) => void) {
    this.changed = changed;
  }

  run(task: () => Promise<void>): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.changed(true);
    void (async () => {
      try {
        await task();
      } finally {
        this.running = false;
        this.changed(false);
      }
    })();
  }
}
