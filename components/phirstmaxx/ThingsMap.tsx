"use client";

/**
 * The Things page's map (spec §8): one pin per researched thing with a
 * position, coloured by whether it fits this week when that filter is on.
 * Loaded with next/dynamic by the page, never on the server, as the Places
 * map is.
 */
import { useEffect } from "react";
import Link from "next/link";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import type { ThingCard } from "./api";

import "leaflet/dist/leaflet.css";

function pin(colour: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="36" viewBox="0 0 24 36"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="${colour}" stroke="#222" stroke-width="1"/><circle cx="12" cy="12" r="5" fill="white"/></svg>`;
  return L.divIcon({ html: svg, iconSize: [24, 36], iconAnchor: [12, 36], popupAnchor: [0, -36], className: "" });
}

const COLOUR: Record<string, string> = { fits: "#5fae7a", tight: "#d6a24a", no: "#8a8a8a" };

function FitBounds({ things }: { things: ThingCard[] }) {
  const map = useMap();
  useEffect(() => {
    const pts = things.filter((t) => t.lat !== null && t.lng !== null).map((t) => [t.lat!, t.lng!] as [number, number]);
    if (pts.length === 0) return;
    const bounds = L.latLngBounds(pts);
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
  }, [map, things]);
  return null;
}

export function ThingsMap({ things }: { things: ThingCard[] }) {
  const placed = things.filter((t) => t.lat !== null && t.lng !== null);
  const centre: [number, number] = placed.length ? [placed[0].lat!, placed[0].lng!] : [53.96, -1.08];
  return (
    <div className="h-[380px] overflow-hidden rounded-v2-md border border-hairline" data-testid="pm-things-map">
      <MapContainer center={centre} zoom={9} className="h-full w-full" scrollWheelZoom>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitBounds things={placed} />
        {placed.map((t) => (
          <Marker key={t.id} position={[t.lat!, t.lng!]} icon={pin(t.fit ? COLOUR[t.fit.verdict] : "#c79bf5")}>
            <Popup>
              <div className="text-sm">
                <Link href={`/phirstmaxx/things/${t.id}`} className="font-medium underline">
                  {t.name}
                </Link>
                {t.from_home ? <div>{t.from_home.minutes} min by car</div> : null}
                {t.fit ? <div>{t.fit.reason}</div> : null}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
