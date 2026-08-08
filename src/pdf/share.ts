import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';

/**
 * Renders HTML to a PDF and opens the iOS share sheet. Falls back to the system print dialog when
 * sharing is unavailable (which shouldn't happen on iOS, but the check is cheap).
 */
export async function sharePdf(html: string, filename: string): Promise<void> {
  try {
    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: filename,
        UTI: 'com.adobe.pdf',
      });
    } else {
      await Print.printAsync({ uri });
    }
  } catch (error) {
    Alert.alert('Export failed', error instanceof Error ? error.message : 'Could not create the PDF.');
  }
}
