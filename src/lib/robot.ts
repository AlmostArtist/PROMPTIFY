export const ROBOT_KEY = 'pf_prompt_robot_v1';

export const ROBOT_MOODS = [
  'neutral',
  'curious',
  'happy',
  'excited',
  'angry',
  'mischievous',
  'sad',
  'tired',
  'sleepy',
  'thinking',
  'surprised',
  'love',
  'wink',
] as const;

export type RobotMood = typeof ROBOT_MOODS[number];
export type RobotExpression = 'auto' | RobotMood;

export interface RobotPreferences {
  hue: number;
  movement: number;
  expression: RobotExpression;
}

export const DEFAULT_ROBOT: RobotPreferences = {
  hue: 0,
  movement: 100,
  expression: 'auto',
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function normalizeRobot(raw: unknown): RobotPreferences {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return DEFAULT_ROBOT;
  const value = raw as Partial<RobotPreferences>;
  return {
    hue: typeof value.hue === 'number' && Number.isFinite(value.hue) ? clamp(Math.round(value.hue), 0, 360) : DEFAULT_ROBOT.hue,
    movement: typeof value.movement === 'number' && Number.isFinite(value.movement) ? clamp(Math.round(value.movement), 0, 200) : DEFAULT_ROBOT.movement,
    expression: value.expression === 'auto' || ROBOT_MOODS.includes(value.expression as RobotMood)
      ? value.expression as RobotExpression
      : DEFAULT_ROBOT.expression,
  };
}

