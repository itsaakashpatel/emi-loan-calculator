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

export type UnlockOutcome = { success: true } | { success: false; retry: boolean };

/**
 * Like `unlock`, but says whether the failure is worth another try. iOS cancels the prompt when it
 * is raised while the app is still starting or coming back to the front; that is not the user
 * saying no, so the caller should ask again. A real cancel, a lockout or a wrong face is final.
 */
export async function unlockWithOutcome(reason: string): Promise<UnlockOutcome> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      fallbackLabel: 'Use passcode',
      disableDeviceFallback: false,
    });
    if (result.success) return { success: true };
    return { success: false, retry: result.error === 'app_cancel' || result.error === 'system_cancel' };
  } catch {
    return { success: false, retry: false };
  }
}
