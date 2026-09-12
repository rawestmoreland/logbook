import { useEffect, useState } from 'react';
import { Control, Controller, useFormContext, useWatch } from 'react-hook-form';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';

import { FormRow } from '@/components/form-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Input } from '@/components/ui/input';
import { CATEGORY_CLASS_LABELS, isCategoryClass } from '@/constants/aircraft';
import { Spacing } from '@/constants/theme';
import { useAircraft } from '@/hooks/use-aircraft-queries';
import { useRecentAircraft } from '@/hooks/use-recent-aircraft';
import { createFlight } from '@/lib/api/flights';
import { getOrCreateLocalPilot } from '@/lib/api/pilots';
import type { FlightFormValues } from '@/lib/forms/flight-form';
import { useThemeColors } from '@/lib/theme';

type NumberFieldName =
  | 'totalTime'
  | 'picTime'
  | 'sicTime'
  | 'dualTime'
  | 'soloTime'
  | 'nightTime'
  | 'actualInstrument'
  | 'simInstrument'
  | 'dayLandings'
  | 'nightLandings';

function NumberField({
  control,
  name,
  label,
}: {
  control: Control<FlightFormValues>;
  name: NumberFieldName;
  label: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <View style={styles.flex}>
          <ThemedText type='small' themeColor='textSecondary'>
            {label}
          </ThemedText>
          <Input
            value={field.value}
            onChangeText={field.onChange}
            placeholder='0'
            keyboardType='decimal-pad'
            style={styles.inlineInput}
          />
        </View>
      )}
    />
  );
}

function NumberFieldRow({
  control,
  left,
  right,
}: {
  control: Control<FlightFormValues>;
  left: { name: NumberFieldName; label: string };
  right: { name: NumberFieldName; label: string };
}) {
  const colors = useThemeColors();
  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <NumberField control={control} name={left.name} label={left.label} />
      <NumberField control={control} name={right.name} label={right.label} />
    </View>
  );
}

export default function NewFlightScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { data: aircraftList = [] } = useAircraft();
  const recentAircraft = useRecentAircraft(3);
  const [isSaving, setIsSaving] = useState(false);

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useFormContext<FlightFormValues>();

  const aircraftId = useWatch({ control, name: 'aircraftId' });
  const selectedAircraft = aircraftList.find((a) => a.id === aircraftId);

  // Default to the pilot's most recently flown aircraft, but only until
  // they've made a choice of their own.
  useEffect(() => {
    if (aircraftId || !recentAircraft[0]) return;
    setValue('aircraftId', recentAircraft[0].id, { shouldValidate: true });
  }, [aircraftId, recentAircraft, setValue]);

  const quickPicks = (recentAircraft.length ? recentAircraft : aircraftList).slice(0, 3);

  const classLabel =
    selectedAircraft && isCategoryClass(selectedAircraft.categoryClass)
      ? `${CATEGORY_CLASS_LABELS[selectedAircraft.categoryClass]} (from aircraft)`
      : undefined;

  const onSave = handleSubmit(async (values) => {
    setIsSaving(true);
    try {
      const pilot = await getOrCreateLocalPilot();
      await createFlight({
        pilotId: pilot.id,
        aircraftId: values.aircraftId,
        date: values.date,
        routeFrom: values.routeFrom,
        routeTo: values.routeTo,
        totalTime: values.totalTime,
        picTime: values.picTime,
        sicTime: values.sicTime,
        dualTime: values.dualTime,
        soloTime: values.soloTime,
        nightTime: values.nightTime,
        actualInstrument: values.actualInstrument,
        simInstrument: values.simInstrument,
        dayLandings: values.dayLandings,
        nightLandings: values.nightLandings,
        remarks: values.remarks,
      });
      router.back();
    } finally {
      setIsSaving(false);
    }
  });

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <ThemedText themeColor='textSecondary'>Cancel</ThemedText>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={onSave} disabled={isSaving} hitSlop={8}>
              <ThemedText style={isSaving && styles.disabled}>Save</ThemedText>
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.select({ ios: 'padding', default: undefined })}
      >
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps='handled'>
          <Controller
            control={control}
            name='date'
            render={({ field }) => (
              <FormRow label='Date' error={errors.date?.message}>
                <Input
                  value={field.value}
                  onChangeText={field.onChange}
                  placeholder='YYYY-MM-DD'
                  style={styles.inlineInput}
                />
              </FormRow>
            )}
          />

          <FormRow
            label='Aircraft'
            value={
              selectedAircraft
                ? `${selectedAircraft.tailNumber} · ${selectedAircraft.type}`
                : undefined
            }
            placeholder='Select aircraft'
            chevron
            error={errors.aircraftId?.message}
            onPress={() => router.push('/(app)/new-flight/select-aircraft')}
          />

          {quickPicks.length > 0 && (
            <View style={styles.pillRow}>
              {quickPicks.map((aircraft) => {
                const selected = aircraft.id === aircraftId;
                return (
                  <Pressable
                    key={aircraft.id}
                    onPress={() =>
                      setValue('aircraftId', aircraft.id, { shouldValidate: true })
                    }
                    style={[
                      styles.pill,
                      {
                        borderColor: selected ? colors.tint : colors.border,
                        backgroundColor: selected ? `${colors.tint}20` : 'transparent',
                      },
                    ]}
                  >
                    <ThemedText
                      type='small'
                      style={{ color: selected ? colors.tint : colors.text }}
                    >
                      {selected ? '✓ ' : ''}
                      {aircraft.tailNumber}
                    </ThemedText>
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => router.push('/(app)/new-flight/select-aircraft')}
                style={[styles.pill, { borderColor: colors.border }]}
              >
                <ThemedText type='small'>All aircraft</ThemedText>
              </Pressable>
            </View>
          )}

          <View style={[styles.row, { borderBottomColor: colors.border }]}>
            <Controller
              control={control}
              name='routeFrom'
              render={({ field }) => (
                <View style={styles.flex}>
                  <ThemedText type='small' themeColor='textSecondary'>
                    From
                  </ThemedText>
                  <Input
                    value={field.value}
                    onChangeText={(text) => field.onChange(text.toUpperCase())}
                    placeholder='LSZH'
                    autoCapitalize='characters'
                    style={styles.inlineInput}
                  />
                </View>
              )}
            />
            <ThemedText themeColor='textSecondary'>→</ThemedText>
            <Controller
              control={control}
              name='routeTo'
              render={({ field }) => (
                <View style={styles.flex}>
                  <ThemedText type='small' themeColor='textSecondary'>
                    To
                  </ThemedText>
                  <Input
                    value={field.value}
                    onChangeText={(text) => field.onChange(text.toUpperCase())}
                    placeholder='LSGG'
                    autoCapitalize='characters'
                    style={styles.inlineInput}
                  />
                </View>
              )}
            />
          </View>
          {!!(errors.routeFrom || errors.routeTo) && (
            <ThemedText type='small' style={styles.errorText}>
              {errors.routeFrom?.message ?? errors.routeTo?.message}
            </ThemedText>
          )}

          <FormRow label='Class' value={classLabel} placeholder='Select an aircraft first' />

          <ThemedText type='small' themeColor='textSecondary' style={styles.sectionTitle}>
            Times
          </ThemedText>
          <NumberFieldRow
            control={control}
            left={{ name: 'totalTime', label: 'Total time' }}
            right={{ name: 'picTime', label: 'PIC time' }}
          />
          <NumberFieldRow
            control={control}
            left={{ name: 'sicTime', label: 'SIC time' }}
            right={{ name: 'dualTime', label: 'Dual time' }}
          />
          <NumberFieldRow
            control={control}
            left={{ name: 'soloTime', label: 'Solo time' }}
            right={{ name: 'nightTime', label: 'Night time' }}
          />
          <NumberFieldRow
            control={control}
            left={{ name: 'actualInstrument', label: 'Actual instrument' }}
            right={{ name: 'simInstrument', label: 'Sim instrument' }}
          />

          <ThemedText type='small' themeColor='textSecondary' style={styles.sectionTitle}>
            Landings
          </ThemedText>
          <NumberFieldRow
            control={control}
            left={{ name: 'dayLandings', label: 'Day landings' }}
            right={{ name: 'nightLandings', label: 'Night landings' }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  disabled: {
    opacity: 0.4,
  },
  form: {
    paddingHorizontal: Spacing.three,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },
  pill: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 999,
    borderWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  inlineInput: {
    borderWidth: 0,
    padding: 0,
    height: 24,
    fontSize: 16,
    fontWeight: '500',
  },
  errorText: {
    color: '#dc2626',
    marginTop: -Spacing.two,
    marginBottom: Spacing.two,
  },
  sectionTitle: {
    marginTop: Spacing.four,
    marginBottom: -Spacing.one,
    textTransform: 'uppercase',
  },
});
