export interface UiMapping {
  id: string;
  name: string;
  device_id: number;
  ui_object_id: number;
}

export interface AppConfig {
  processor_host: string;
  processor_port: number;
  credential_dir: string;
  client_cert: string;
  client_key: string;
  ca_cert: string;
  expected_server_name: string;
  expected_server_ip: string;
  mqtt_url: string;
  mqtt_username: string;
  mqtt_password: string;
  instance_id: string;
  base_topic: string;
  discovery_prefix: string;
  ha_birth_topic: string;
  publish_debug: boolean;
  mappings: UiMapping[];
  data_dir: string;
  auto_discover?: boolean;
  max_discovered_objects?: number;
  metadata_file?: string;
  name_overrides?: ObjectName[];
}

export interface ObjectName extends ObservedObject {
  name: string;
  area_name?: string;
}

export interface ObservedObject {
  system_id: number;
  object_type: number;
  object_id: number;
}

export interface ObservationEvent extends ObservedObject {
  event_type: string;
  source_kind: "ipl_event_report" | "runtime_property_report" | "ipl_command_observation";
  operation_id: number;
  property_number?: number;
  received_at: string;
  session_id: string;
  level?: number;
  wire_value?: number;
  status?: number;
  status_name?: string;
  selection?: number;
  state?: number;
  trailing_hex?: string;
  originator_feature?: number;
  fade_quarters?: number;
  delay_quarters?: number;
}

export interface IplFrame {
  version: number;
  msgType: number;
  receiverProcessing: string;
  attempt: string;
  systemId: number;
  senderId: number;
  receiverId: number;
  messageId: number;
  operationId?: number;
  body: Buffer;
}

export interface LevelEvent {
  event_type: "level_adjustment";
  source_kind: "ui_level_report";
  device_id: number;
  ui_object_id: number;
  level: number;
  wire_value: number;
  received_at: string;
  session_id: string;
}

export interface TransportOptions {
  host: string;
  port: number;
  cert: string;
  key: string;
  ca: string;
  expectedName?: string;
  expectedIp?: string;
  onFrame(frame: IplFrame, sessionId: string): void;
  onHealth(healthy: boolean): void;
  log(message: string): void;
}

export interface Publisher {
  setIplHealth(healthy: boolean): void;
  publishLevel(mappingId: string, event: LevelEvent): boolean;
  publishDebug(frame: IplFrame, sessionId: string): boolean;
  publishObservation?(event: ObservationEvent): boolean;
  stop(): Promise<void>;
}

export interface Broker {
  url: string;
  username?: string;
  password?: string;
}
