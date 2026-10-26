import { createAlertsForChange } from "./alerts";
import { generateInsightForChange } from "./insights";

/** Runs after a verified change is persisted: insight first (so alerts can link to it), then alerts. */
export async function onChangeDetected(changeId: string): Promise<void> {
  try {
    await generateInsightForChange(changeId);
  } catch (e) {
    console.error(`[change-events] insight generation failed for ${changeId}:`, (e as Error).message);
  }
  await createAlertsForChange(changeId);
}
