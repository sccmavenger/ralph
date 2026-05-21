/**
 * Auto-save tower result when a tower event ends.
 * Detects transition from active → ended and POSTs the result.
 */

const LAST_ACTIVE_KEY = "tower-last-active-event";
const SAVED_RESULTS_KEY = "tower-saved-results";

interface TowerEventData {
  id: string;
  name: string;
  endDate: string;
  currentWeek: number;
}

interface SavedTowerResult {
  towerEventId: string;
  towerName: string;
  roomsCleared: number;
  totalRooms: number;
}

/**
 * Check if we should auto-save a result for a previously active tower.
 * Returns the result to save, or null if no save needed.
 */
export function checkAutoSave(
  currentTower: TowerEventData | null,
  totalRooms: number
): SavedTowerResult | null {
  if (typeof window === "undefined") return null;

  const lastActiveJson = localStorage.getItem(LAST_ACTIVE_KEY);
  if (!lastActiveJson) {
    // First visit or no prior tower — just store current
    if (currentTower) {
      localStorage.setItem(LAST_ACTIVE_KEY, JSON.stringify(currentTower));
    }
    return null;
  }

  const lastActive: TowerEventData = JSON.parse(lastActiveJson);

  // Update current active tower
  if (currentTower) {
    localStorage.setItem(LAST_ACTIVE_KEY, JSON.stringify(currentTower));
  } else {
    localStorage.removeItem(LAST_ACTIVE_KEY);
  }

  // Check if last active tower has ended (different from current, or no current)
  const isEnded = !currentTower || currentTower.id !== lastActive.id;
  if (!isEnded) return null;

  // Check if already saved
  const savedResults = getSavedResultIds();
  if (savedResults.has(lastActive.id)) return null;

  // Count cleared rooms from localStorage
  const clearedW1 = getClearedRoomCount(lastActive.id, 1);
  const clearedW2 = getClearedRoomCount(lastActive.id, 2);
  const roomsCleared = clearedW1 + clearedW2;

  // Only save if at least 1 room cleared
  if (roomsCleared === 0) return null;

  return {
    towerEventId: lastActive.id,
    towerName: lastActive.name,
    roomsCleared,
    totalRooms,
  };
}

/**
 * Mark a tower event as saved (prevents duplicate saves).
 */
export function markAsSaved(towerEventId: string): void {
  const saved = getSavedResultIds();
  saved.add(towerEventId);
  localStorage.setItem(SAVED_RESULTS_KEY, JSON.stringify([...saved]));
}

function getSavedResultIds(): Set<string> {
  try {
    const stored = localStorage.getItem(SAVED_RESULTS_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

function getClearedRoomCount(eventId: string, week: number): number {
  try {
    const key = `tower-cleared-${eventId}-w${week}`;
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored).length : 0;
  } catch {
    return 0;
  }
}
