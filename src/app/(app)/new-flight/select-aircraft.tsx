import { useMemo, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Input } from '@/components/ui/input';
import { Spacing } from '@/constants/theme';
import { useAircraft } from '@/hooks/use-aircraft-queries';
import { useRecentAircraft } from '@/hooks/use-recent-aircraft';
import type { FlightFormValues } from '@/lib/forms/flight-form';
import { useThemeColors } from '@/lib/theme';
import type Aircraft from '@/lib/db/models/Aircraft';

export default function SelectAircraftScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { data: aircraftList = [] } = useAircraft();
  const recentAircraft = useRecentAircraft(3);
  const { setValue, control } = useFormContext<FlightFormValues>();
  const selectedId = useWatch({ control, name: 'aircraftId' });

  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return aircraftList;
    return aircraftList.filter(
      (a) =>
        a.tailNumber.toLowerCase().includes(normalized) ||
        a.type.toLowerCase().includes(normalized),
    );
  }, [aircraftList, query]);

  const groupedByType = useMemo(() => {
    const groups = new Map<string, Aircraft[]>();
    for (const aircraft of filtered) {
      const list = groups.get(aircraft.type) ?? [];
      list.push(aircraft);
      groups.set(aircraft.type, list);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([type, aircraft]) => ({
        type,
        aircraft: aircraft.sort((a, b) => a.tailNumber.localeCompare(b.tailNumber)),
      }));
  }, [filtered]);

  const selectAircraft = (id: string) => {
    setValue('aircraftId', id, { shouldValidate: true });
    router.back();
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps='handled'>
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder='Registration or type'
          autoCapitalize='none'
          style={styles.search}
        />

        <Pressable
          onPress={() => Alert.alert('Add new aircraft', 'Coming soon.')}
          style={styles.addRow}
        >
          <ThemedText style={{ color: colors.tint }}>+ Add new aircraft</ThemedText>
        </Pressable>

        {!query && recentAircraft.length > 0 && (
          <View style={styles.section}>
            <ThemedText type='small' themeColor='textSecondary' style={styles.sectionTitle}>
              Recent
            </ThemedText>
            {recentAircraft.map((aircraft) => (
              <AircraftRow
                key={aircraft.id}
                aircraft={aircraft}
                selected={aircraft.id === selectedId}
                onPress={() => selectAircraft(aircraft.id)}
              />
            ))}
          </View>
        )}

        <View style={styles.section}>
          <ThemedText type='small' themeColor='textSecondary' style={styles.sectionTitle}>
            All aircraft by type
          </ThemedText>
          {groupedByType.length === 0 && (
            <ThemedText themeColor='textSecondary'>No aircraft found.</ThemedText>
          )}
          {groupedByType.map(({ type, aircraft }) => (
            <View key={type}>
              <ThemedText type='smallBold' style={styles.typeTitle}>
                {type}
              </ThemedText>
              {aircraft.map((a) => (
                <AircraftRow
                  key={a.id}
                  aircraft={a}
                  selected={a.id === selectedId}
                  onPress={() => selectAircraft(a.id)}
                />
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

function AircraftRow({
  aircraft,
  selected,
  onPress,
}: {
  aircraft: Aircraft;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable onPress={onPress} style={[styles.aircraftRow, { borderBottomColor: colors.border }]}>
      <ThemedText type='smallBold'>{aircraft.tailNumber}</ThemedText>
      <ThemedText themeColor='textSecondary' style={styles.flexFill}>
        {aircraft.type}
      </ThemedText>
      {selected && <ThemedText style={{ color: colors.tint }}>✓</ThemedText>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.five,
    gap: Spacing.two,
  },
  search: {
    marginBottom: Spacing.two,
  },
  addRow: {
    paddingVertical: Spacing.two,
  },
  section: {
    marginTop: Spacing.three,
  },
  sectionTitle: {
    marginBottom: Spacing.two,
    textTransform: 'uppercase',
  },
  typeTitle: {
    marginTop: Spacing.three,
    marginBottom: Spacing.one,
  },
  aircraftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  flexFill: {
    flex: 1,
  },
});
