"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import type { Place } from "./PlacesClient";

import "leaflet/dist/leaflet.css";

const STATUS_ICON_COLOR: Record<string, string> = {
  wishlist: "#888",
  planned: "#e5a200",
  visited: "#22c55e",
};

function makeIcon(status: string) {
  const color = STATUS_ICON_COLOR[status] ?? "#888";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="36" viewBox="0 0 24 36"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="${color}" stroke="#333" stroke-width="1"/><circle cx="12" cy="12" r="5" fill="white"/></svg>`;
  return L.divIcon({
    html: svg,
    iconSize: [24, 36],
    iconAnchor: [12, 36],
    popupAnchor: [0, -36],
    className: "",
  });
}

function FitBounds({ places }: { places: Place[] }) {
  const map = useMap();
  useEffect(() => {
    if (places.length === 0) return;
    const bounds = L.latLngBounds(
      places
        .filter((p) => p.lat != null && p.lng != null)
        .map((p) => [p.lat!, p.lng!]),
    );
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
    }
  }, [map, places]);
  return null;
}

export function PlacesMap({ places }: { places: Place[] }) {
  const center =
    places.length > 0 && places[0].lat != null
      ? ([places[0].lat, places[0].lng!] as [number, number])
      : ([53.5349, -1.0537] as [number, number]);

  return (
    <div className="h-[400px] rounded-lg border border-ink-2 overflow-hidden">
      <MapContainer
        center={center}
        zoom={10}
        className="h-full w-full"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds places={places} />
        {places.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat!, p.lng!]}
            icon={makeIcon(p.status)}
          >
            <Popup>
              <div className="text-sm font-semibold">{p.name}</div>
              <div className="text-xs text-gray-600 capitalize">
                {p.category} · {p.status}
              </div>
              {p.description && (
                <div className="text-xs mt-1">{p.description}</div>
              )}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
