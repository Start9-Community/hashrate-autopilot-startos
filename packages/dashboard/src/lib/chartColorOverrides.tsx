/**
 * #334: app-wide access to the operator's chart color overrides.
 *
 * The Chart colors config lets an operator recolor every chart series and
 * marker (stored as `config.chart_color_overrides`). The charts already
 * resolve colors through `getChartColor(key, overrides)`, but non-chart
 * surfaces (the Timeline rows/glyphs, the alert-span popups) used to read
 * `CHART_COLOR_DEFAULTS` or hardcoded literals, so a customized color
 * showed on the chart but not there. This provider parses the overrides
 * once from the shared `['config']` query and hands them to any component
 * that renders a chart-keyed color, so the whole UI stays consistent.
 */

import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { api } from './api';
import { getChartColor, parseOverrides, type ChartColorKey } from './chartColors';

export type ChartColorOverrides = Partial<Record<ChartColorKey, string>>;

const ChartColorOverridesContext = createContext<ChartColorOverrides>({});

/** Wrap the authed app so descendants can resolve overridden chart colors. */
export function ChartColorOverridesProvider({ children }: { children: ReactNode }) {
  // Shares the ['config'] cache key with everything else that reads config,
  // so this adds no extra request.
  const configQuery = useQuery({ queryKey: ['config'], queryFn: () => api.config() });
  const overrides = useMemo(
    () => parseOverrides(configQuery.data?.config?.chart_color_overrides),
    [configQuery.data?.config?.chart_color_overrides],
  );
  return (
    <ChartColorOverridesContext.Provider value={overrides}>
      {children}
    </ChartColorOverridesContext.Provider>
  );
}

/** The operator's parsed override bag (empty outside the provider). */
export function useChartColorOverrides(): ChartColorOverrides {
  return useContext(ChartColorOverridesContext);
}

/** Resolve one chart color key against the operator's overrides. */
export function useChartColor(key: ChartColorKey): string {
  return getChartColor(key, useContext(ChartColorOverridesContext));
}
