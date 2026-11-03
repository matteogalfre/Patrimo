/**
 * Mini-courbe sans axes, pour les cartes d'actifs. SVG simple : une centaine
 * de points au plus, inutile de sortir Skia pour ça.
 */

import React, { memo, useMemo } from 'react';
import Svg, { Polyline } from 'react-native-svg';

const Sparkline = memo(({ values = [], width = 72, height = 28, color }) => {
  const points = useMemo(() => {
    const v = values.filter((x) => Number.isFinite(x));
    if (v.length < 2) return null;
    const min = Math.min(...v);
    const max = Math.max(...v);
    const span = max - min || 1;
    return v
      .map((y, i) => `${((i / (v.length - 1)) * width).toFixed(1)},${(height - 2 - ((y - min) / span) * (height - 4)).toFixed(1)}`)
      .join(' ');
  }, [values, width, height]);

  if (!points) return null;
  return (
    <Svg width={width} height={height}>
      <Polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </Svg>
  );
});

Sparkline.displayName = 'Sparkline';

export default Sparkline;
