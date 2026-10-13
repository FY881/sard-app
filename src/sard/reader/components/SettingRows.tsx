import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SelectableChip, Slider } from '@components';
import { useTheme } from '@hooks/persisted';

/**
 * Small building blocks in the LNReader bottom-sheet style (label, then a
 * row of chips or a slider), used by the Sard reader sections.
 */

export interface ChipOption<T> {
  value: T;
  label: string;
  fontFamily?: string;
}

interface ChipRowProps<T> {
  label: string;
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  description?: string;
}

export function ChipRow<T extends string | number | null>({
  label,
  options,
  value,
  onChange,
  description,
}: ChipRowProps<T>) {
  const theme = useTheme();
  return (
    <View style={styles.chipRow}>
      <Text style={[styles.title, { color: theme.onSurfaceVariant }]}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {options.map(o => (
          <SelectableChip
            key={String(o.value)}
            label={o.label}
            selected={o.value === value}
            theme={theme}
            onPress={() => onChange(o.value)}
            customFontFamily={o.fontFamily}
          />
        ))}
      </ScrollView>
      {description ? (
        <Text style={[styles.description, { color: theme.onSurfaceVariant }]}>
          {description}
        </Text>
      ) : null}
    </View>
  );
}

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  disabled?: boolean;
  showStops?: boolean;
}

export const SliderRow: React.FC<SliderRowProps> = ({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  disabled,
  showStops,
}) => {
  const theme = useTheme();
  return (
    <View style={[styles.sliderRow, disabled && styles.disabled]}>
      <View style={styles.labelRow}>
        <Text style={{ color: theme.onSurfaceVariant }}>{label}</Text>
        <Text style={[styles.value, { color: theme.onSurface }]}>{format(value)}</Text>
      </View>
      <Slider
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        showStops={showStops}
        showValueIndicator
        formatValue={format}
        accessibilityLabel={label}
        onSlidingComplete={onChange}
      />
    </View>
  );
};

export const SectionNote: React.FC<{ children: string }> = ({ children }) => {
  const theme = useTheme();
  return (
    <Text style={[styles.note, { color: theme.onSurfaceVariant }]}>{children}</Text>
  );
};

const styles = StyleSheet.create({
  chipRow: {
    paddingVertical: 8,
  },
  title: {
    fontSize: 14,
    paddingBottom: 6,
    paddingHorizontal: 16,
  },
  chips: {
    gap: 4,
    paddingHorizontal: 12,
  },
  description: {
    fontSize: 12,
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  sliderRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  disabled: {
    opacity: 0.5,
  },
  labelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  value: {
    fontVariant: ['tabular-nums'],
  },
  note: {
    fontSize: 12,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
});
