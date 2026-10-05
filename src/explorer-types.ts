import type { LevelEvent, ObservationEvent } from './contracts.js';

export type ExplorerCategory = 'controls' | 'loads' | 'scenes' | 'occupancy' | 'shades';
export interface ExplorerEvent {
  sequence: number;
  object_key: string;
  category: ExplorerCategory;
  payload: LevelEvent | ObservationEvent;
  mqtt_accepted: boolean;
}
export interface ExplorerObject {
  key: string;
  name: string;
  room: string | null;
  named: boolean;
  system_id: number | null;
  object_type: number;
  object_id: number;
  device_id?: number;
  event_types: string[];
  categories: ExplorerCategory[];
  mqtt_topic: string;
  latest?: ExplorerEvent;
}
export interface ExplorerSnapshot {
  version: 1;
  app_version: string;
  instance: string;
  started_at: string;
  oldest_sequence: number;
  last_sequence: number;
  history_limit: number;
  history_truncated: boolean;
  health: { ipl: boolean; mqtt: boolean; session_id: string | null };
  diagnostics: Record<string, number>;
  objects: ExplorerObject[];
  events: ExplorerEvent[];
}
