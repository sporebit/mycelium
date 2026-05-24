export type FuelSource = { name: string; url: string };

// CMA-mandated public fuel price endpoints. Each retailer publishes their
// own JSON; we fetch them all in parallel and merge.
export const FUEL_SOURCES: FuelSource[] = [
  { name: "Asda", url: "https://storelocator.asda.com/fuel_prices_data.json" },
  { name: "Applegreen", url: "https://applegreenstores.com/fuel-prices/data.json" },
  { name: "Ascona", url: "https://fuelprices.asconagroup.co.uk/newfuel.json" },
  { name: "BP", url: "https://www.bp.com/en_gb/united-kingdom/home/fuelprices/fuel_prices_data.json" },
  { name: "Esso", url: "https://fuelprices.esso.co.uk/latestdata.json" },
  { name: "Jet", url: "https://jetlocal.co.uk/fuel_prices_data.json" },
  { name: "Karan", url: "https://api2.krlmedia.com/integration/live_price/krl" },
  { name: "Morrisons", url: "https://www.morrisons.com/fuel-prices/fuel.json" },
  { name: "Moto", url: "https://moto-way.com/fuel-price/fuel_prices.json" },
  { name: "MFG", url: "https://fuel.motorfuelgroup.com/fuel_prices_data.json" },
  { name: "Rontec", url: "https://www.rontec-servicestation.co.uk/fuel-prices/data/fuel_prices_data.json" },
  { name: "Sainsbury's", url: "https://api.sainsburys.co.uk/v1/exports/latest/fuel_prices_data.json" },
  { name: "Shell", url: "https://www.shell.co.uk/fuel-prices-data.html" },
  { name: "Tesco", url: "https://www.tesco.com/fuel_prices/fuel_prices_data.json" },
];
