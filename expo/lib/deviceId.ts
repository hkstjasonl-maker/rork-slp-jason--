import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Application from 'expo-application';

const DEVICE_ID_KEY = '@nanohab_device_id';

/**
 * Returns a persisted, opaque device identifier for this install.
 * Generated on first call and stored in AsyncStorage.
 */
export async function getDeviceId(): Promise<string> {
  let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    const random = Math.random().toString(36).substring(2, 10);
    const timestamp = Date.now().toString(36);
    const os = Device.osName || 'unknown';
    deviceId = `${os}-${timestamp}-${random}`;
    await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

export interface DeviceInfo {
  device_name: string;
  device_model: string;
  os_name: string;
  os_version: string;
  app_version: string;
}

export function getDeviceInfo(): DeviceInfo {
  return {
    device_name: Device.deviceName || 'Unknown',
    device_model: Device.modelName || Device.modelId || 'Unknown',
    os_name: Device.osName || 'Unknown',
    os_version: Device.osVersion || 'Unknown',
    app_version: Application.nativeApplicationVersion || '1.0.0',
  };
}
