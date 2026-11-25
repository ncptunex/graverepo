// Maps real ritual progress to one of six garden pictures (approved Moonlit Plot direction, O12).
// Pure: the same counts always give the same stage. It only reads numbers the Rising screen
// already has. It never claims anything about GitHub (the garden shows steps ticked in GRAVEREPO).
//
//   0 bare, cracked stone     (nothing ticked, or no steps)
//   1 moss                    (some steps ticked)
//   2 sprouts
//   3 flowers
//   4 glowing mushrooms       (every step ticked, not yet marked as revived)
//   5 full garden and lantern (marked as revived in GRAVEREPO)
export type GardenStage = 0 | 1 | 2 | 3 | 4 | 5;

export function gardenStage(done: number, total: number, isRevived: boolean): GardenStage {
  if (isRevived) return 5;
  if (total <= 0 || done <= 0) return 0;
  if (done >= total) return 4;
  // Partly done: spread the steps across stages 1 to 3.
  const share = Math.min(Math.max(done / total, 0), 1);
  return (1 + Math.min(2, Math.floor(share * 3))) as GardenStage;
}
