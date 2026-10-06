// Maps the 0..100 creativity slider to an instruction block.

interface CreativityDescriptor {
  headline: string;
  directives: string[];
}

export function describeCreativity(value: number): CreativityDescriptor {
  const v = Math.max(0, Math.min(100, Math.round(value)));

  if (v <= 20) {
    return {
      headline: 'Stay strictly logical and precise.',
      directives: [
        'Prioritize accuracy, proven methods, and conventional best practices.',
        'Avoid speculation; ground every claim in established reasoning.',
      ],
    };
  }
  if (v <= 45) {
    return {
      headline: 'Lean analytical with a touch of flexibility.',
      directives: [
        'Favor reliable, well-understood approaches.',
        'Introduce alternatives only when they clearly improve the result.',
      ],
    };
  }
  if (v <= 65) {
    return {
      headline: 'Balance rigor with originality.',
      directives: [
        'Combine sound reasoning with fresh angles.',
        'Offer at least one non-obvious idea alongside the safe choice.',
      ],
    };
  }
  if (v <= 85) {
    return {
      headline: 'Lean creative and exploratory.',
      directives: [
        'Prefer original, surprising solutions over predictable ones.',
        'Take considered risks and explain the upside of each.',
      ],
    };
  }
  return {
    headline: 'Be highly creative and original.',
    directives: [
      'Avoid generic, predictable, or templated solutions.',
      'Explore unconventional angles and bold ideas; reach for the unexpected.',
    ],
  };
}
