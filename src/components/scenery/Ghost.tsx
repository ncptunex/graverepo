// A ghost mascot as a standalone picture. Always hidden from assistive technology.
import { GhostShape, type GhostPose } from './GhostShape';
import './scenery.css';

export type GhostProps = {
  readonly pose?: GhostPose;
  /** Width in pixels. The height follows the 48 by 56 box. */
  readonly size?: number;
  readonly className?: string;
};

export function Ghost({ pose = 'calm', size = 48, className }: GhostProps) {
  return (
    <svg
      className={`ghost${className ? ` ${className}` : ''}`}
      viewBox="0 0 48 56"
      width={size}
      height={Math.round((size * 56) / 48)}
      aria-hidden="true"
      focusable="false"
    >
      <GhostShape pose={pose} />
    </svg>
  );
}
