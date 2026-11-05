import * as LocalAuthentication from 'expo-local-authentication';

/** True when the phone has Face ID, Touch ID or a passcode set up. */
export async function canLock(): Promise<boolean> {
  try {
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    return level !== LocalAuthentication.SecurityLevel.NONE;
  } catch {
    return false;
  }
}

/** Asks for Face ID, falling back to the device passcode. Resolves `true` on success. */
export async function unlock(reason: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      fallbackLabel: 'Use passcode',
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}
