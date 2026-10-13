/* Hall Layout - offline smart direction grouping. No remote AI or API calls. */
(function (root) {
  'use strict';
  const enhanceSteps = function enhanceSteps(steps, points, metersPerUnit) {
  if (!Array.isArray(steps) || steps.length < 4 || !Array.isArray(points)) return steps;
  const unit = Number.isFinite(metersPerUnit) && metersPerUnit > 0 ? metersPerUnit : 1;
  const dist = step => {
    let len = 0;
    for (let k = step.pathStartIndex + 1; k <= step.pathEndIndex; k++) {
      if (!points[k - 1] || !points[k]) return Infinity;
      len += Math.hypot(points[k].x - points[k - 1].x, points[k].y - points[k - 1].y);
    }
    return Math.max(1, Math.round(len * unit));
  };
  const turns = step => step.type === 'left' || step.type === 'right' || step.type === 'uturn' ? 1 : 0;
  const command = (step, metres) => {
    if (step.type === 'left') return `turn left and walk ${metres} m`;
    if (step.type === 'right') return `turn right and walk ${metres} m`;
    if (step.type === 'uturn') return `turn around and walk ${metres} m`;
    return `continue ${metres} m`;
  };
  const result = [steps[0]];
  const eligible = step => step && ['straight', 'left', 'right'].includes(step.type) &&
    Number.isInteger(step.pathStartIndex) && Number.isInteger(step.pathEndIndex);
  for (let i = 1; i < steps.length - 1; i++) {
    const first = steps[i], next = steps[i + 1];
    // Combine only a 1-3 metre approach with the following real instruction.
    // Both actions are spoken explicitly; neither corner is deleted.
    if (i + 1 < steps.length - 1 && eligible(first) && eligible(next) &&
        first.pathEndIndex === next.pathStartIndex && dist(first) <= 3) {
      const firstM = dist(first), nextM = dist(next);
      const introduction = first.type === 'straight' ?
        `Walk ${firstM} m` :
        `${first.type === 'left' ? 'Turn left' : 'Turn right'} and walk ${firstM} m`;
      const main = `${introduction}, then ${command(next, nextM)}`;
      result.push({
        type: 'bend',
        icon: 'fa-route',
        iconClass: 'si-bend',
        main,
        spoken: main,
        sub: next.sub || first.sub || null,
        landmark: null,
        turnsCount: turns(first) + turns(next),
        pathStartIndex: first.pathStartIndex,
        pathEndIndex: next.pathEndIndex
      });
      i++;
    } else {
      result.push({ ...first, turnsCount: turns(first) });
    }
  }
  result.push({ ...steps[steps.length - 1], turnsCount: 0 });
  return result;
};
  const guide = Object.freeze({ enhanceSteps });
  if (typeof module === 'object' && module.exports) module.exports = guide;
  if (root) root.HallNavGuide = guide;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
