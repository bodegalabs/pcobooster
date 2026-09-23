/** Unit tests cannot reach a database. Integration tests inject a local D1 binding. */
export const env = {
  DB: {
    prepare: () => {
      throw new Error("Inject a local D1 database in integration tests.");
    },
  },
};
