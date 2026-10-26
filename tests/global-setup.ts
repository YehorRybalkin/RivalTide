import { migrate } from "../scripts/migrate";

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://rivaltide:rivaltide@localhost:5432/rivaltide_test";
  await migrate(url, { reset: true, log: false });
}
