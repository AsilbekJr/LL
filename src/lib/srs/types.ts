import type {
  CardStatus,
  Direction,
  ItemType,
  ReviewMethod,
  ReviewResult,
} from "@/lib/supabase/database.types";
import type { IsoDate } from "./dates";

export type { CardStatus, Direction, ItemType, ReviewMethod, ReviewResult };

/** The scheduling-relevant part of a `cards` row (camelCase, UI/DB independent). */
export interface SrsCard {
  id: string;
  itemId: string;
  direction: Direction;
  /** Method stage 1..6 (see stages.ts). */
  stage: number;
  /** How many ladder rungs this card has passed. `ladder.length` = whole ladder done. */
  ladderStep: number;
  dueDate: IsoDate;
  lapses: number;
  reps: number;
  status: CardStatus;
  /** Serialized ts-fsrs card, only used when srsMode = 'fsrs'. */
  fsrsState?: FsrsState | null;
}

/** Production history needed by the "fake passing" gate. */
export interface ProductionProgress {
  writtenPassed: boolean;
  spokenPassed: boolean;
}

/** User settings that affect scheduling. */
export interface SrsSettings {
  ladder: number[];
  srsMode: "ladder" | "fsrs";
  overduePenalty: boolean;
  /** How many top ladder rungs are locked until production is done. */
  productionGateSteps: number;
  maintenanceDays: number;
  timezone: string;
}

export const DEFAULT_SETTINGS: SrsSettings = {
  ladder: [1, 3, 7, 12, 20, 35, 60, 100],
  srsMode: "ladder",
  overduePenalty: true,
  productionGateSteps: 3,
  maintenanceDays: 180,
  timezone: "Asia/Tashkent",
};

/** ts-fsrs Card with dates serialized for jsonb storage. */
export interface FsrsState {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: string;
}
