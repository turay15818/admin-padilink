/**
 * A map with one pin: click to drop it, drag to nudge it. Used wherever an office is placed.
 * Falls back to the bare dark ground when the tile host is unreachable, like the live map.
 */
import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { resolveStyle } from './LiveMap';
import { T } from './theme';

/** A map with one pin: click to move it, drag to nudge it. */
export function PinMap({ value, onChange, readOnly }: { value: { lat: number; lng: number } | null; onChange?: (v: { lat: number; lng: number }) => void; readOnly?: boolean }) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    let gone = false;
    let map: maplibregl.Map | null = null;
    void resolveStyle().then(style => {
      if (gone || !divRef.current) return;
      map = new maplibregl.Map({ container: divRef.current, style, center: value ? [value.lng, value.lat] : [-11.9, 8.5], zoom: value ? 13 : 6.7, attributionControl: { compact: true }, interactive: true });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      if (!readOnly) {
        map.on('click', e => { const next = { lat: e.lngLat.lat, lng: e.lngLat.lng }; place(next); onChangeRef.current?.(next); });
        map.getCanvas().style.cursor = 'crosshair';
      }
      if (value) place(value);
    });
    return () => { gone = true; map?.remove(); mapRef.current = null; markerRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const place = (v: { lat: number; lng: number }) => {
    const map = mapRef.current; if (!map) return;
    if (!markerRef.current) {
      markerRef.current = new maplibregl.Marker({ color: T.brand, draggable: !readOnly }).setLngLat([v.lng, v.lat]).addTo(map);
      markerRef.current.on('dragend', () => { const p = markerRef.current!.getLngLat(); onChangeRef.current?.({ lat: p.lat, lng: p.lng }); });
    } else markerRef.current.setLngLat([v.lng, v.lat]);
  };
  useEffect(() => { if (value) { place(value); mapRef.current?.easeTo({ center: [value.lng, value.lat], duration: 300 }); } }, [value?.lat, value?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={divRef} style={{ width: '100%', height: '100%', borderRadius: 8, overflow: 'hidden' }} />;
}

