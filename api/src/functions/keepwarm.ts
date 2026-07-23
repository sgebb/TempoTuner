import { app, InvocationContext, Timer } from '@azure/functions';

/**
 * Consumption-plan cold starts would make the leaderboard feel sluggish, so a
 * five-minute heartbeat keeps the instance warm. Costs nothing: it stays deep
 * inside the monthly free grant.
 */
export async function keepwarm(_timer: Timer, context: InvocationContext): Promise<void> {
  context.log('keepwarm tick');
}

app.timer('keepwarm', {
  schedule: '0 */5 * * * *',
  handler: keepwarm,
});
