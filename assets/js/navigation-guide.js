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
    return compactVisibleSteps(result, points, unit);
  }

  // Show ACTIONS instead of separately numbering the origin and destination.
  // This changes only instructions and highlighted point ranges; never geometry.
  function compactVisibleSteps(input, points, unit) {
    if (!Array.isArray(input) || input.length < 3) return input;
    const items = input.map(s => ({ ...s }));
    const first = items[0];
    const movement = items[1];
    if (first && first.type === 'start' && movement &&
        Number.isInteger(movement.pathStartIndex) && Number.isInteger(movement.pathEndIndex) &&
        movement.pathEndIndex > movement.pathStartIndex) {
      movement.pathStartIndex = Math.min(first.pathStartIndex || 0, movement.pathStartIndex);
      // The first walking instruction already starts where the origin marker is.
      if (movement.type === 'straight') {
        const meters = distanceAlong(points, movement.pathStartIndex, movement.pathEndIndex, unit);
        movement.main = 'Follow the aisle · ' + meters + ' m';
        movement.spoken = 'Starting at your stall, follow the blue route for ' + meters + ' metres';
      }
      movement.origin = first.main;
      items.shift();
    }
    const last = items[items.length - 1];
    if (!last || last.type !== 'end') return items;
    const original = String(last.main || '');
    const destination = original.includes(' is ') ? original.split(' is ')[0].trim()
      : original.replace(/^(?:Arrive at|Find|Look for)\s+/i, '').trim();
    const name = destination || 'your destination';
    const prev = items[items.length - 2];
    if (prev && prev.type !== 'start' && Number.isInteger(prev.pathStartIndex) &&
        Number.isInteger(prev.pathEndIndex) && prev.pathEndIndex > prev.pathStartIndex) {
      const shortApproach = distanceAlong(points, prev.pathStartIndex, prev.pathEndIndex, unit) <= 3;
      const realTurn = prev.type === 'right' || prev.type === 'left' || prev.type === 'uturn';
      // Fold only very short destination-approach segments into arrival; retain
      // any turn explicitly in both on-screen and spoken instructions.
      if (shortApproach && ['straight','right','left'].includes(prev.type)) {
        const instruction = realTurn
          ? (prev.type === 'uturn' ? 'Turn around' : prev.type === 'right' ? 'Turn right' : 'Turn left') + ' to stall ' + name
          : 'Look for stall ' + name;
        const spoken = realTurn
          ? instruction.replace(/stall /,'stall number ') + ' at the end of this route'
          : 'At the end of the aisle, look for stall number ' + name;
        items[items.length - 2] = {
          ...last,
          type: 'end',
          main: instruction,
          spoken,
          sub: 'Follow the highlighted final approach',
          turnsCount: (prev.turnsCount || (realTurn ? 1 : 0)),
          pathStartIndex: prev.pathStartIndex,
          pathEndIndex: Math.max(last.pathEndIndex, prev.pathEndIndex)
        };
        items.pop();
        return items;
      }
    }
    last.main = 'Look for stall ' + name;
    last.spoken = 'At the end of your route, look for stall number ' + name;
    last.sub = 'Follow the route to the destination entrance';
    return items;
  }

  function distanceAlong(points, a, b, unit) {
    let len = 0;
    for (let i = a + 1; i <= b; i++) {
      if (!points[i] || !points[i - 1]) return Infinity;
      len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    }
    return Math.max(1, Math.round(len * unit));
  }

  const guide = Object.freeze({ enhanceSteps });
  if (typeof module === 'object' && module.exports) module.exports = guide;
  if (root) root.HallNavGuide = guide;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
