// Hats and the level that unlocks each one.
export const HATS = [
  { id: 'none', name: 'None', level: 1 },
  { id: 'cap', name: 'Cap', level: 1 },
  { id: 'headband', name: 'Headband', level: 2 },
  { id: 'beanie', name: 'Beanie', level: 3 },
  { id: 'cowboy', name: 'Cowboy', level: 4 },
  { id: 'helmet', name: 'Helmet', level: 6 },
  { id: 'tophat', name: 'Top hat', level: 8 },
  { id: 'viking', name: 'Viking', level: 10 },
  { id: 'crown', name: 'Crown', level: 15 },
];
export const isHat = (id) => HATS.some((h) => h.id === id);
