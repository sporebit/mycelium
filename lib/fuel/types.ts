export type Station = {
  siteId: string;
  brand: string;
  address: string;
  postcode: string;
  lat: number;
  lng: number;
  e10: number | null;
  b7: number | null;
  source: string; // retailer name
  distanceMiles?: number; // populated after filter
};

export type FuelSummary = {
  avgE10: number | null;
  avgB7: number | null;
  cheapestE10: { station: Station; price: number } | null;
  cheapestB7: { station: Station; price: number } | null;
  stationCount: number;
};

export type FuelApiResponse = {
  summary: FuelSummary;
  stations: Station[];
  failed: string[];
  centre: { lat: number; lng: number; name: string };
  lastUpdated: string; // ISO
};
