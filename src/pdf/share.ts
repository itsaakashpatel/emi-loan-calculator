import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';

/**
 * Renders HTML to a PDF and opens the iOS share sheet. Falls back to the system print dialog when
 * sharing is unavailable (which shouldn't happen on iOS, but the check is cheap).
 *
 * `expo-print` names its output with a UUID, and neither the share sheet's `dialogTitle` nor any
 * other option renames the file — so whatever the user saves or mails keeps that UUID. The file is
 * therefore moved to `filename.pdf` first, which is the name that actually travels with it.
 */
export async function sharePdf(html: string, filename: string): Promise<void> {
  try {
    const { uri } = await Print.printToFileAsync({ html });
    const named = await renamePdf(uri, filename);

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(named, {
        mimeType: 'application/pdf',
        dialogTitle: filename,
        UTI: 'com.adobe.pdf',
      });
    } else {
      await Print.printAsync({ uri: named });
    }
  } catch (error) {
    Alert.alert('Export failed', error instanceof Error ? error.message : 'Could not create the PDF.');
  }
}

/**
 * Moves the printed file to a readable name in the cache directory. Returns the original URI if the
 * move fails — a UUID filename is a poor result, but it beats losing the export entirely.
 */
async function renamePdf(uri: string, filename: string): Promise<string> {
  try {
    const printed = new File(uri);
    const target = new File(Paths.cache, `${safeName(filename)}.pdf`);
    // Exports repeat, so a previous file of the same name is expected rather than exceptional.
    await printed.move(target, { overwrite: true });
    return target.uri;
  } catch {
    return uri;
  }
}

/** Keeps the name to characters that survive every filesystem and mail client. */
function safeName(filename: string): string {
  const cleaned = filename.replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'export';
}
