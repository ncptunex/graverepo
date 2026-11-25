// Injectable clock (graveyard-dashboard task 2.1). The state layer reads time only through a
// `Clock`, so tests can replace it. Pure helpers never read a clock: they receive `now` as an
// argument. The ritual session uses the same `() => Date` shape.
export type Clock = () => Date;

export const systemClock: Clock = () => new Date();
