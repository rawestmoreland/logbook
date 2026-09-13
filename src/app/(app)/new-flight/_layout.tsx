import { zodResolver } from '@hookform/resolvers/zod';
import { Stack } from 'expo-router';
import { FormProvider, useForm } from 'react-hook-form';

import {
  defaultFlightFormValues,
  flightFormSchema,
  type FlightFormValues,
} from '@logbook/core';

// Hosts the react-hook-form instance for the whole new-flight flow. `index`
// (the form) and `select-aircraft` (the picker) are siblings pushed onto
// this nested stack, so putting FormProvider here — rather than in
// `index` — lets the picker write straight into the same form state instead
// of round-tripping the selection through route params.
export default function NewFlightLayout() {
  const form = useForm<FlightFormValues>({
    resolver: zodResolver(flightFormSchema),
    defaultValues: defaultFlightFormValues(),
  });

  return (
    <FormProvider {...form}>
      <Stack screenOptions={{ headerTitleAlign: 'center' }}>
        <Stack.Screen name='index' options={{ title: 'New flight' }} />
        <Stack.Screen
          name='select-aircraft'
          options={{ title: 'Select aircraft', headerBackTitle: '' }}
        />
      </Stack>
    </FormProvider>
  );
}
