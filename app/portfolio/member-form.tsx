import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Screen } from '../../src/components/Screen';
import { SelectChipRow, type ChipOption } from '../../src/components/primitives';
import { Button, Card, Label } from '../../src/components/primitives';
import { TextField } from '../../src/components/inputs';
import type { Relation } from '../../src/lib/api/types';
import { usePortfolioStore } from '../../src/store/portfolio';
import { useTheme } from '../../src/theme/ThemeProvider';

const RELATIONS: ReadonlyArray<ChipOption<Relation>> = [
  { value: 'self', label: 'Myself' },
  { value: 'spouse', label: 'Spouse' },
  { value: 'child', label: 'Child' },
  { value: 'parent', label: 'Parent' },
  { value: 'other', label: 'Other' },
];

const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** Add or edit a family member. */
export default function MemberFormScreen() {
  const router = useRouter();
  const { spacing } = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const existing = usePortfolioStore((s) => (id ? s.memberById(id) : undefined));
  const createMember = usePortfolioStore((s) => s.createMember);
  const updateMember = usePortfolioStore((s) => s.updateMember);

  const [name, setName] = useState(existing?.name ?? '');
  const [relation, setRelation] = useState<Relation>(existing?.relation ?? 'self');
  const [pan, setPan] = useState('');
  const [saving, setSaving] = useState(false);

  const panEntered = pan.trim().length > 0;
  const panValid = PAN_PATTERN.test(pan.trim().toUpperCase());
  const canSave = name.trim().length > 0 && (!panEntered || panValid) && !saving;

  const save = async () => {
    setSaving(true);
    try {
      // The PAN never leaves the device. Only its hash does, and only so a CAS
      // import can tell whose folios it is looking at.
      const panHash = panValid
        ? await Crypto.digestStringAsync(
            Crypto.CryptoDigestAlgorithm.SHA256,
            pan.trim().toUpperCase(),
          )
        : undefined;

      const draft = { name: name.trim(), relation, ...(panHash ? { panHash } : null) };
      if (id) await updateMember(id, draft);
      else await createMember(draft);

      router.back();
    } catch (error) {
      Alert.alert(
        'Could not save',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      footer={
        <Button
          label={saving ? 'Saving…' : id ? 'Save changes' : 'Add member'}
          disabled={!canSave}
          onPress={() => void save()}
        />
      }
    >
      <Card>
        <TextField
          label="Name"
          value={name}
          onChange={setName}
          placeholder="e.g. Aakash"
          autoFocus={!id}
        />
        <Label size="caption" tone="muted" style={{ marginBottom: spacing.xs }}>
          Relationship
        </Label>
        <SelectChipRow options={RELATIONS} value={relation} onChange={setRelation} />
      </Card>

      <Card title="PAN (optional)">
        <TextField
          label="PAN"
          value={pan}
          onChange={(next) => setPan(next.toUpperCase())}
          placeholder="ABCDE1234F"
        />
        <Label size="micro" tone={panEntered && !panValid ? 'negative' : 'faint'}>
          {panEntered && !panValid
            ? 'A PAN is five letters, four digits, then a letter.'
            : 'Used to match folios when you import a statement. Only a one-way hash of it is sent — the PAN itself stays on this device.'}
        </Label>
        {existing?.hasPan ? (
          <View style={{ marginTop: spacing.sm }}>
            <Label size="micro" tone="muted">
              A PAN is already saved. Leave this blank to keep it.
            </Label>
          </View>
        ) : null}
      </Card>
    </Screen>
  );
}
