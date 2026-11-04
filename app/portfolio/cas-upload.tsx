import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';

import { Screen } from '../../src/components/Screen';
import {
  Button,
  Card,
  Chip,
  IconGlyph,
  Label,
  ListRow,
} from '../../src/components/primitives';
import { confirmCasImport, uploadCas } from '../../src/lib/api/portfolio';
import type { CasHolding } from '../../src/lib/api/types';
import { formatMoney, formatNumber } from '../../src/lib/format/money';
import { useAuthStore } from '../../src/store/auth';
import { usePortfolioStore } from '../../src/store/portfolio';
import { useCurrency } from '../../src/store/settings';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * Imports a Consolidated Account Statement.
 *
 * Nothing is written until the user has seen what was read out of the PDF and
 * confirmed it. Parsing someone's statement wrongly and silently is the worst
 * outcome here, so the review step is not optional.
 */
export default function CasUploadScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const currency = useCurrency();
  const { memberId } = useLocalSearchParams<{ memberId: string }>();

  const token = useAuthStore((s) => s.token);
  const member = usePortfolioStore((s) => s.memberById(memberId));
  const sync = usePortfolioStore((s) => s.sync);

  const [busy, setBusy] = useState(false);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<CasHolding[] | null>(null);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());

  const pickAndUpload = async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    });
    if (picked.canceled || !picked.assets?.[0] || !token) return;

    const file = picked.assets[0];
    setBusy(true);
    try {
      const result = await uploadCas(token, memberId, {
        uri: file.uri,
        name: file.name ?? 'statement.pdf',
      });

      setUploadId(result.uploadId);
      setHoldings(result.holdings);
      // Everything that can actually be stored starts ticked; a scheme with no
      // AMFI code cannot be priced, so it is shown but not selectable.
      setAccepted(
        new Set(
          result.holdings
            .map((holding, index) => (holding.amfiCode ? index : -1))
            .filter((index) => index >= 0),
        ),
      );
    } catch (error) {
      Alert.alert(
        'Could not read that statement',
        error instanceof Error
          ? error.message
          : 'Check that it is the mutual fund CAS emailed by CAMS or KFintech.',
      );
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!uploadId || !token) return;
    setBusy(true);
    try {
      const { imported, skipped } = await confirmCasImport(token, uploadId, [...accepted]);
      await sync();

      Alert.alert(
        'Imported',
        skipped > 0
          ? `${imported} holding${imported === 1 ? '' : 's'} added. ${skipped} could not be matched to a scheme.`
          : `${imported} holding${imported === 1 ? '' : 's'} added.`,
        [{ text: 'Done', onPress: () => router.back() }],
      );
    } catch (error) {
      Alert.alert('Could not import', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (index: number) => {
    setAccepted((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  if (holdings) {
    const importable = holdings.filter((holding) => holding.amfiCode !== null).length;

    return (
      <Screen
        footer={
          <Button
            label={busy ? 'Importing…' : `Import ${accepted.size} holding${accepted.size === 1 ? '' : 's'}`}
            disabled={busy || accepted.size === 0}
            onPress={() => void confirm()}
          />
        }
      >
        <Card>
          <Label size="body" weight="medium">
            Found {holdings.length} holding{holdings.length === 1 ? '' : 's'}
          </Label>
          <Label size="caption" tone="muted">
            {importable === holdings.length
              ? `Choose what to add to ${member?.name ?? 'this member'}.`
              : `${holdings.length - importable} could not be matched to a scheme and cannot be added.`}
          </Label>
        </Card>

        <Card padded={false}>
          {holdings.map((holding, index) => {
            const usable = holding.amfiCode !== null;
            const checked = accepted.has(index);

            return (
              <Pressable
                key={`${holding.folioNumber}:${holding.isin}`}
                disabled={!usable}
                onPress={() => toggle(index)}
                style={({ pressed }) => ({ opacity: !usable ? 0.45 : pressed ? 0.6 : 1 })}
              >
                <ListRow
                  title={holding.schemeName}
                  subtitle={`${formatNumber(holding.units, { decimals: 3, trim: true })} units · folio ${holding.folioNumber}`}
                  last={index === holdings.length - 1}
                  right={
                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                      {holding.marketValue !== null ? (
                        <Label size="caption" weight="medium" tabular>
                          {formatMoney(holding.marketValue, { currency })}
                        </Label>
                      ) : null}
                      {usable ? (
                        <IconGlyph
                          name={checked ? 'checkmark-circle' : 'ellipse-outline'}
                          size={22}
                          color={checked ? colors.accent : colors.textFaint}
                        />
                      ) : (
                        <Chip label="Not matched" tone="warning" />
                      )}
                    </View>
                  }
                />
              </Pressable>
            );
          })}
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <Button
          label={busy ? 'Reading…' : 'Choose a PDF'
          }
          icon="document-attach-outline"
          disabled={busy || !token}
          onPress={() => void pickAndUpload()}
        />
      }
    >
      <Card title={`Import for ${member?.name ?? 'this member'}`}>
        <Label size="body">
          A Consolidated Account Statement lists every mutual fund folio held against one PAN.
        </Label>
        <View style={{ height: spacing.md }} />
        <Label size="caption" tone="muted">
          Request one free from CAMS or KFintech and they email it as a PDF. Open the email, save
          the attachment, then choose it here.
        </Label>
        <View style={{ height: spacing.md }} />
        <Label size="caption" tone="muted">
          A password-protected statement must be unlocked before you upload it.
        </Label>
      </Card>

      <Card title="What happens to the file">
        <Label size="caption" tone="muted">
          The PDF is read once to pull out your holdings, then deleted. You choose what to keep
          before anything is saved.
        </Label>
      </Card>

      {busy ? (
        <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : null}
    </Screen>
  );
}
