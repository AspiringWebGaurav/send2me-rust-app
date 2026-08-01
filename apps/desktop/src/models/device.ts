export type DeviceStatus = 'online' | 'offline' | 'pairing';
export type DeviceKind = 'desktop' | 'mobile' | 'web' | 'unknown';

export interface Device {
  id: string;
  name: string;
  os: string;
  deviceType: DeviceKind;
  status: DeviceStatus;
  lastSeen?: string;
  isTrusted: boolean;
  pairingCode?: string;
}

/** Live LAN beacon shape returned by the `get_peers` command. */
export interface PeerBeacon {
  node_id: string;
  hostname: string;
  os: string;
  device_type: string;
  pairing_code: string;
}
