/**
 * The starter prep lists (master run §8: "starter lists pre-filled"). Made
 * once when a family space is set up; everything after that is the
 * family's own to edit. No prices: what things cost is theirs to fill in.
 */

export type StarterList = { slug: string; title: string; items: readonly string[] };

export const STARTER_LISTS: readonly StarterList[] = [
  {
    slug: "hospital-bag",
    title: "Hospital bag",
    items: [
      "Maternity notes and birth plan",
      "Phone chargers, long cable",
      "Comfortable clothes for labour",
      "Dressing gown and slippers",
      "Nightwear that opens at the front",
      "Going-home clothes",
      "Maternity pads",
      "Breast pads",
      "Toiletries and lip balm",
      "Snacks and drinks, with a straw",
      "Change for parking",
      "Baby: vests and sleepsuits (newborn and 0–3 months)",
      "Baby: hat and cardigan",
      "Baby: nappies and cotton wool",
      "Baby: muslin squares",
      "Baby: blanket",
      "Car seat, fitted before the day",
      "Partner: change of clothes, snacks",
    ],
  },
  {
    slug: "nursery",
    title: "Nursery",
    items: [
      "Cot or Moses basket",
      "New mattress that fits it",
      "Fitted sheets",
      "Cellular blankets or sleeping bags",
      "Room thermometer",
      "Baby monitor",
      "Changing mat",
      "Chest of drawers or storage",
      "Blackout blind",
      "Night light",
      "Chair for feeding",
      "Nappy bin",
    ],
  },
  {
    slug: "buying",
    title: "Buying list",
    items: [
      "Pram or pushchair",
      "Car seat",
      "Sling or carrier",
      "Nappies, newborn size",
      "Wipes or cotton wool",
      "Nappy cream",
      "Vests and sleepsuits",
      "Bibs and muslins",
      "Baby bath or bath support",
      "Soft towels",
      "Baby thermometer",
      "Nail clippers or file",
      "Bottles and steriliser, if using",
      "Breast pump, if using",
      "Changing bag",
    ],
  },
];
