/**
 * Tower notification triggers for event start and Week 2 unlock.
 * Uses the existing CommanderNotification system.
 */

export interface TowerNotificationConfig {
  towerEnabled: boolean;
}

export interface TowerEvent {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  currentWeek: number;
}

/**
 * Determines if a "tower event started" notification should fire.
 * Returns true if the event is new (started within last 24h) and not previously notified.
 */
export function shouldNotifyTowerStart(
  event: TowerEvent,
  lastNotifiedEventId: string | null,
  config: TowerNotificationConfig
): boolean {
  if (!config.towerEnabled) return false;
  if (lastNotifiedEventId === event.id) return false;

  const startDate = new Date(event.startDate);
  const now = new Date();
  const hoursSinceStart = (now.getTime() - startDate.getTime()) / (1000 * 60 * 60);

  return hoursSinceStart >= 0 && hoursSinceStart <= 24;
}

/**
 * Determines if a "Week 2 unlocked" notification should fire.
 * Week 2 unlocks 7 days after event start.
 */
export function shouldNotifyWeek2Unlock(
  event: TowerEvent,
  week2Notified: boolean,
  config: TowerNotificationConfig
): boolean {
  if (!config.towerEnabled) return false;
  if (week2Notified) return false;
  if (event.currentWeek < 2) return false;

  return true;
}

/**
 * Generate notification payload for tower event start.
 */
export function getTowerStartNotification(event: TowerEvent) {
  return {
    type: "tower_event_start" as const,
    title: `${event.name} is live — see your plan`,
    message: `A new tower event has started. Open the Tower Planner to see your team assignments.`,
    linkUrl: "/analyze/tower-planner",
  };
}

/**
 * Generate notification payload for Week 2 unlock.
 */
export function getWeek2UnlockNotification(event: TowerEvent) {
  return {
    type: "tower_week2_unlock" as const,
    title: "Week 2 unlocked — your teams are refreshed",
    message: `Week 2 of ${event.name} is now available. Your locked teams are refreshed.`,
    linkUrl: "/analyze/tower-planner",
  };
}
