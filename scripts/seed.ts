import { db } from "@worship-admin/api/db";

const main = async () => {
  await db.execute("select 1");
  console.log("Seed complete: no baseline rows are required.");
};

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
