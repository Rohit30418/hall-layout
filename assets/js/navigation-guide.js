/* Hall Layout · Easy Directions
   Accurate route geometry stays owned by the existing pathfinder.
   This is a presentation-only formatter: no AI calls, no invented turns.
*/
(function (root) {
  'use strict';

  function enhanceSteps(steps, points, metersPerUnit) {
    if (!Array.isArray(steps) || steps.length < 3 || !Array.isArray(points)) return steps;
    const unit = Number.isFinite(metersPerUnit) && metersPerUnit > 0 ? metersPerUnit : 1;
    const isTurn = s => !!s && ['left', 'right', 'uturn'].includes(s.type);
    const turnCount = s => isTurn(s) ? 1 : 0;
    const distance = step => {
      if (!Number.isInteger(step.pathStartIndex) || !Number.isInteger(step.pathEndIndex)) return Infinity;
      let len = 0;
      for (let k = step.pathStartIndex + 1; k <= step.pathEndIndex; k++) {
        const a = points[k - 1], b = points[k];
        if (!a || !b) return Infinity;
        len += Math.hypot(b.x - a.x, b.y - a.y);
      }
      return Math.max(1, Math.round(len * unit));
    };
    const verb = type => type === 'left' ? 'Turn left' : type === 'right' ? 'Turn right'
      : type === 'uturn' ? 'Turn around' : 'Continue straight';
    const pretty = (type, metres, first) => {
      if (first && type === 'straight') return 'Follow the blue route · ' + metres + ' m';
      if (type === 'straight') return 'Continue straight · ' + metres + ' m';
      return verb(type) + ' · ' + metres + ' m';
    };
    const audio = (type, metres, first) => {
      if (type === 'straight') return (first ? 'Follow the highlighted route for ' : 'Continue straight for ') + metres + ' metres';
      return verb(type) + ' and walk ' + metres + ' metres';
    };
    const start = { ...steps[0], main: steps[0].main, sub: 'Follow the highlighted path to the aisle', turnsCount: 0 };
    const result = [start];
    for (let i = 1; i < steps.length - 1; i++) {
      const current = steps[i], next = steps[i + 1];
      const firstWalk = result.length === 1;
      const valid = s => s && ['straight','left','right','uturn'].includes(s.type)
        && Number.isInteger(s.pathStartIndex) && Number.isInteger(s.pathEndIndex);
      const d = distance(current);
      const canMerge = i + 1 < steps.length - 1 && valid(current) && valid(next) &&
        current.type !== 'uturn' && next.type !== 'uturn' &&
        current.pathEndIndex === next.pathStartIndex && d <= 3;

      if (canMerge) {
        const nextD = distance(next);
        const count = turnCount(current) + turnCount(next);
        const firstText = firstWalk && current.type === 'straight'
          ? 'Join the aisle'
          : (current.type === 'straight' ? 'Move a short distance' : verb(current.type));
        const secondText = next.type === 'straight'
          ? 'continue' : (next.type === 'left' ? 'turn left' : 'turn right');
        const main = firstText + ', then ' + secondText + ' · ' + nextD + ' m';
        result.push({
          ...next,
          type: 'bend',
          icon: 'fa-route',
          iconClass: 'si-bend',
          main,
          spoken: firstText + ', then ' + secondText + ' and walk ' + nextD + ' metres',
          sub: next.sub || current.sub || null,
          turnsCount: count,
          pathStartIndex: current.pathStartIndex,
          pathEndIndex: next.pathEndIndex
        });
        i++;
        continue;
      }

      if (!valid(current)) {
        result.push({ ...current, turnsCount: turnCount(current) });
        continue;
      }
      const heading = pretty(current.type, d, firstWalk);
      result.push({
        ...current,
        main: heading,
        spoken: audio(current.type, d, firstWalk),
        turnsCount: turnCount(current)
      });
    }
    const ending = steps[steps.length - 1];
    const sideMatch = /\bis (on your left|on your right|straight ahead)\b/i.exec(String(ending.main || ''));
    const side = sideMatch ? sideMatch[1] : null;
    const name = ending.main ? String(ending.main).split(' is ')[0] : '';
    result.push({
      ...ending,
      main: side ? 'Arrive at ' + name : ending.main,
      spoken: side ? 'You have arrived at ' + name + '. Your destination is ' + side : ending.main,
      sub: side ? (side === 'straight ahead' ? 'Your destination is ahead' : 'Your destination is ' + side) : (ending.sub || "You've arrived"),
      turnsCount: 0
    });
    return result;
  }

  const guide = Object.freeze({ enhanceSteps });
  if (typeof module === 'object' && module.exports) module.exports = guide;
  if (root) root.HallNavGuide = guide;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
