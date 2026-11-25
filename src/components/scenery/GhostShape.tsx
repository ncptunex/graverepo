// The friendly ghost, drawn as SVG shapes in a 48 by 56 box. Three poses only (design-system.md
// open item "number of mascot poses"): calm, curious and happy. Scenery: callers hide it from
// assistive technology, and it never carries a message on its own.
export type GhostPose = 'calm' | 'curious' | 'happy';

export function GhostShape({ pose }: { readonly pose: GhostPose }) {
  return (
    <>
      <path className="ghost__body" d="M6 52V24a18 18 0 0 1 36 0V52l-6-5-6 5-6-5-6 5-6-5-6 5z" />
      <ellipse className="ghost__cheek" cx="13" cy="33" rx="3.2" ry="2" />
      <ellipse className="ghost__cheek" cx="35" cy="33" rx="3.2" ry="2" />
      {pose === 'happy' ? (
        <path className="ghost__line" d="M14.5 28q3-4.5 6 0M27.5 28q3-4.5 6 0" />
      ) : (
        <>
          <circle className="ghost__eye" cx="18" cy="27" r="2.6" />
          <circle className="ghost__eye" cx="30" cy="27" r={pose === 'curious' ? 3.4 : 2.6} />
        </>
      )}
      {pose === 'calm' && <path className="ghost__line" d="M21.5 35h5" />}
      {pose === 'curious' && <circle className="ghost__line" cx="24" cy="36" r="1.9" />}
      {pose === 'happy' && <path className="ghost__line" d="M19.5 34q4.5 5 9 0" />}
    </>
  );
}
