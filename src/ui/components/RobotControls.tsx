import { useEffect, useState } from 'react';
import { DEFAULT_ROBOT, ROBOT_MOODS, type RobotExpression, type RobotMood } from '@/lib/robot';
import { RoboEyes } from '../RoboEyes';
import { useRobotPreferences } from '../hooks/useRobotPreferences';
import { useThemePreferences } from '../hooks/useThemePreferences';

const LABELS: Record<RobotExpression, string> = {
  auto: 'Auto',
  neutral: 'Neutral',
  curious: 'Curious',
  happy: 'Happy',
  excited: 'Excited',
  angry: 'Angry',
  mischievous: 'Mischief',
  sad: 'Sad',
  tired: 'Tired',
  sleepy: 'Sleepy',
  thinking: 'Thinking',
  surprised: 'Surprised',
  love: 'Love',
  wink: 'Wink',
};

const AUTO_PREVIEW: RobotMood[] = ['neutral', 'curious', 'happy', 'love', 'mischievous', 'surprised'];

export function RobotControls() {
  const { preferences, update, ready, status } = useRobotPreferences();
  const appearance = useThemePreferences();
  const [autoIndex, setAutoIndex] = useState(0);

  useEffect(() => {
    if (preferences.expression !== 'auto' || appearance.reducedMotion) return;
    const id = window.setInterval(() => setAutoIndex(index => (index + 1) % AUTO_PREVIEW.length), 1600);
    return () => window.clearInterval(id);
  }, [appearance.reducedMotion, preferences.expression]);

  const previewMood = preferences.expression === 'auto' ? AUTO_PREVIEW[autoIndex] : preferences.expression;
  const expressions: RobotExpression[] = ['auto', ...ROBOT_MOODS];

  return (
    <section className="rc-card" aria-labelledby="robot-controls-heading">
      <header className="rc-heading">
        <div>
          <span>Prompt bar</span>
          <h2 id="robot-controls-heading">Robot controls</h2>
        </div>
        <span className="rc-saved">{ready ? status : 'Loading…'}</span>
      </header>

      <div className="rc-preview" aria-label={`${LABELS[preferences.expression]} robot preview`}>
        <RoboEyes
          size={72}
          variant="orb"
          mood={previewMood}
          hue={preferences.hue}
          movement={preferences.movement}
          trackPointer
          reducedMotion={appearance.reducedMotion}
        />
        <div>
          <strong>{LABELS[preferences.expression]}</strong>
          <span>{preferences.expression === 'auto' ? 'Reacts to hover, work and results' : 'Keep this expression on the prompt bar'}</span>
        </div>
      </div>

      <fieldset disabled={!ready} className="rc-settings">
        <legend className="tc-sr-only">Prompt bar robot preferences</legend>

        <label className="rc-range rc-hue">
          <span>Robot hue <output>{preferences.hue}°</output></span>
          <input
            aria-label="Prompt bar robot hue"
            type="range"
            min="0"
            max="360"
            value={preferences.hue}
            onChange={event => update({ hue: Number(event.target.value) })}
          />
        </label>

        <label className="rc-range">
          <span>Eye movement <output>{preferences.movement}%</output></span>
          <input
            aria-label="Prompt bar eye movement intensity"
            type="range"
            min="0"
            max="200"
            value={preferences.movement}
            onChange={event => update({ movement: Number(event.target.value) })}
          />
          <small><span>Calm</span><span>Reactive</span></small>
        </label>

        <div className="rc-expression-label">Expression</div>
        <div className="rc-expressions">
          {expressions.map(expression => {
            const mood = expression === 'auto' ? 'neutral' : expression;
            return (
              <button
                key={expression}
                type="button"
                aria-label={`${LABELS[expression]} robot expression`}
                aria-pressed={preferences.expression === expression}
                onClick={() => update({ expression })}
              >
                <RoboEyes size={25} variant="eyes-only" mood={mood} color="var(--p-text-1)" trackPointer={false} reducedMotion />
                <span>{LABELS[expression]}</span>
              </button>
            );
          })}
        </div>

        <button type="button" className="rc-reset" onClick={() => update(DEFAULT_ROBOT)}>Reset robot</button>
      </fieldset>
    </section>
  );
}

