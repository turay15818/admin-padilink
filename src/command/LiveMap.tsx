/**
 * The wall.
 *
 * MapLibre on OpenFreeMap's dark vector tiles (no key, no bill). District outlines
 * underneath; incidents as severity-coloured points, responders as small green marks,
 * stations as outlined squares. A sensitive incident with no pin the desk may see is
 * drawn at its district capital with a ring, so the room knows it exists without knowing
 * where it is. Everything the map draws comes in as GeoJSON from the live picture; the map
 * never asks the API itself.
 */
import { useEffect, useMemo, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection, Point } from 'geojson';
import { INCIDENT_STATUS, RESPONDER_ROLE, RESPONDER_STATUS, shapesAsGeoJson, type DistrictShape, type LivePicture } from './api';
import { T, severityTone } from './theme';
import { age } from './ui';

export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/fiord';

/**
 * The ground to draw on when the tile host cannot be reached — an operations room with
 * no internet still has its own incidents, responders and district outlines to show. A
 * blank dark ground with the room's layers on it is a working map; a spinner is not.
 */
const FALLBACK_STYLE: maplibregl.StyleSpecification = { version: 8, sources: {}, layers: [{ id: 'ground', type: 'background', paint: { 'background-color': '#0a1018' } }] };

let styleCache: Promise<maplibregl.StyleSpecification | string> | null = null;
/** The vector style when the host answers within a few seconds, the bare ground otherwise. Asked once per page. */
export function resolveStyle(): Promise<maplibregl.StyleSpecification | string> {
  if (!styleCache) {
    styleCache = (async () => {
      try {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 6000);
        const response = await fetch(MAP_STYLE, { signal: controller.signal });
        window.clearTimeout(timer);
        if (!response.ok) return FALLBACK_STYLE;
        return (await response.json()) as maplibregl.StyleSpecification;
      } catch {
        return FALLBACK_STYLE;
      }
    })();
  }
  return styleCache;
}

export type StationPin = { id: string; name: string; latitude: number; longitude: number; verified: boolean };
export type HotspotPin = { latitude: number; longitude: number; reported: number; critical: number; place: string | null; topCategory: string | null };

export function LiveMap({ live, shapes, stations = [], hotspots = [], onOpen, focus, height = '100%', interactive = true, fit }: {
  live: LivePicture | null; shapes: DistrictShape[]; stations?: StationPin[];
  /** Clusters of past reports, drawn as warm circles sized by count — the analytics layer. */
  hotspots?: HotspotPin[]; onOpen?: (id: string) => void;
  /** Fly here when it changes. */
  focus?: [number, number] | null; height?: number | string; interactive?: boolean;
  /** Fit the view to what is drawn, once there is something. */
  fit?: boolean;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loaded = useRef(false);
  const fitted = useRef(false);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  const areas = useMemo(() => (shapes.length ? shapesAsGeoJson(shapes) : null), [shapes]);
  const incidents = useMemo<FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: (live?.incidents ?? []).map(i => {
      const d = live?.districts.find(x => x.slug === i.districtSlug);
      const lng = i.latitude !== null && i.longitude !== null ? i.longitude : d?.longitude;
      const lat = i.latitude !== null && i.longitude !== null ? i.latitude : d?.latitude;
      if (lng === undefined || lat === undefined) return null;
      return {
        type: 'Feature' as const,
        properties: { id: i.id, number: i.number, words: i.isSensitive ? 'Private' : i.situationWords, severity: i.severity, status: INCIDENT_STATUS[i.status], agew: age(i.ageMinutes), placed: i.latitude === null, colour: severityTone(i.severity), facility: i.facilityName ?? 'no station', unowned: i.unowned, responding: i.responding },
        geometry: { type: 'Point' as const, coordinates: [lng, lat] },
      };
    }).filter((f): f is NonNullable<typeof f> => f !== null),
  }), [live]);
  const responders = useMemo<FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: (live?.responders ?? []).map(r => ({ type: 'Feature' as const, properties: { name: r.name, role: RESPONDER_ROLE[r.role] ?? '', status: RESPONDER_STATUS[r.status] ?? '', on: r.onIncidentNumber ?? '', agem: r.ageMinutes, busy: r.onIncidentNumber !== null }, geometry: { type: 'Point' as const, coordinates: [r.longitude, r.latitude] } })),
  }), [live]);
  const hotspotFc = useMemo<FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: hotspots.map(h => ({ type: 'Feature' as const, properties: { reported: h.reported, critical: h.critical, place: h.place ?? '', category: h.topCategory ?? '', r: 6 + Math.sqrt(h.reported) * 4 }, geometry: { type: 'Point' as const, coordinates: [h.longitude, h.latitude] } })),
  }), [hotspots]);
  const stationFc = useMemo<FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: stations.map(s => ({ type: 'Feature' as const, properties: { name: s.name, verified: s.verified }, geometry: { type: 'Point' as const, coordinates: [s.longitude, s.latitude] } })),
  }), [stations]);

  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    let gone = false;
    let map: maplibregl.Map | null = null;
    void resolveStyle().then(style => {
      if (gone || !divRef.current) return;
      map = new maplibregl.Map({ container: divRef.current, style, center: [-11.9, 8.5], zoom: 6.7, attributionControl: { compact: true }, interactive });
      mapRef.current = map;
      wire(map);
    });
    return () => { gone = true; map?.remove(); mapRef.current = null; loaded.current = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const wire = (map: maplibregl.Map) => {
    if (interactive) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => {
      map.addSource('areas', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'areas-fill', type: 'fill', source: 'areas', paint: { 'fill-color': T.accent, 'fill-opacity': 0.03 } });
      map.addLayer({ id: 'areas-line', type: 'line', source: 'areas', paint: { 'line-color': T.accent, 'line-width': 1, 'line-opacity': 0.35, 'line-dasharray': [2, 2] } });
      map.addLayer({ id: 'areas-label', type: 'symbol', source: 'areas', minzoom: 6.8, layout: { 'text-field': ['get', 'name'], 'text-size': 10, 'text-transform': 'uppercase', 'text-letter-spacing': 0.15 } as never, paint: { 'text-color': T.muted, 'text-halo-color': T.bg, 'text-halo-width': 1.2, 'text-opacity': 0.8 } });
      map.addSource('hotspots', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'hotspots-glow', type: 'circle', source: 'hotspots', paint: { 'circle-radius': ['*', ['get', 'r'], 1.6], 'circle-color': T.brand, 'circle-opacity': 0.12, 'circle-blur': 0.8 } });
      map.addLayer({ id: 'hotspots', type: 'circle', source: 'hotspots', paint: { 'circle-radius': ['get', 'r'], 'circle-color': T.brand, 'circle-opacity': 0.35, 'circle-stroke-color': T.brand, 'circle-stroke-width': 1 } });
      map.addLayer({ id: 'hotspots-label', type: 'symbol', source: 'hotspots', layout: { 'text-field': ['to-string', ['get', 'reported']], 'text-size': 10 } as never, paint: { 'text-color': T.text, 'text-halo-color': T.bg, 'text-halo-width': 1 } });
      map.addSource('stations', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'stations', type: 'circle', source: 'stations', paint: { 'circle-radius': 4, 'circle-color': T.bg, 'circle-stroke-color': ['case', ['get', 'verified'], T.text, T.muted], 'circle-stroke-width': 1.5 } });
      map.addLayer({ id: 'stations-label', type: 'symbol', source: 'stations', minzoom: 9, layout: { 'text-field': ['get', 'name'], 'text-size': 10, 'text-offset': [0, 1.1], 'text-anchor': 'top' } as never, paint: { 'text-color': T.muted, 'text-halo-color': T.bg, 'text-halo-width': 1 } });
      map.addSource('responders', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'responders', type: 'circle', source: 'responders', paint: { 'circle-radius': 4.5, 'circle-color': ['case', ['get', 'busy'], T.warn, T.good], 'circle-stroke-color': T.bg, 'circle-stroke-width': 1.5 } });
      map.addSource('incidents', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'incidents-glow', type: 'circle', source: 'incidents', filter: ['==', ['get', 'severity'], 1], paint: { 'circle-radius': 16, 'circle-color': ['get', 'colour'], 'circle-opacity': 0.18, 'circle-blur': 0.6 } });
      map.addLayer({ id: 'incidents-ring', type: 'circle', source: 'incidents', filter: ['==', ['get', 'placed'], true], paint: { 'circle-radius': 12, 'circle-color': 'transparent', 'circle-stroke-color': ['get', 'colour'], 'circle-stroke-width': 1.5, 'circle-opacity': 0.9 } });
      map.addLayer({ id: 'incidents', type: 'circle', source: 'incidents', paint: { 'circle-radius': ['case', ['==', ['get', 'severity'], 1], 7, ['==', ['get', 'severity'], 2], 6, 5], 'circle-color': ['get', 'colour'], 'circle-stroke-color': ['case', ['get', 'unowned'], T.text, T.bg], 'circle-stroke-width': ['case', ['get', 'unowned'], 2, 1.5] } });
      map.addLayer({ id: 'incidents-label', type: 'symbol', source: 'incidents', minzoom: 8.5, layout: { 'text-field': ['get', 'number'], 'text-size': 10, 'text-offset': [0, 1.2], 'text-anchor': 'top' } as never, paint: { 'text-color': T.text, 'text-halo-color': T.bg, 'text-halo-width': 1.2 } });
      if (interactive) {
        map.on('click', 'incidents', e => { const p = e.features?.[0]?.properties as { id?: string } | undefined; if (p?.id) onOpenRef.current?.(p.id); });
        map.on('mouseenter', 'incidents', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'incidents', () => { map.getCanvas().style.cursor = ''; });
        const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
        const html = (lines: string[]) => `<div style="font:500 11.5px ${T.font};line-height:1.45">${lines.join('<br/>')}</div>`;
        map.on('mousemove', 'incidents', e => {
          const p = e.features?.[0]?.properties as Record<string, string> | undefined;
          if (!p) return;
          popup.setLngLat((e.features![0].geometry as Point).coordinates as [number, number]).setHTML(html([`<b style="font-family:${T.mono}">${p.number}</b> · ${p.words}`, `<span style="color:${T.muted}">${p.status} · ${p.agew} · ${p.facility}${p.unowned === 'true' ? ' · <span style="color:' + T.warn + '">nobody on it</span>' : ''}${Number(p.responding) > 0 ? ` · ${p.responding} going` : ''}${p.placed === 'true' ? '<br/>private — placed at its district' : ''}</span>`])).addTo(map);
        });
        map.on('mouseleave', 'incidents', () => popup.remove());
        map.on('mousemove', 'responders', e => {
          const p = e.features?.[0]?.properties as Record<string, string> | undefined;
          if (!p) return;
          popup.setLngLat((e.features![0].geometry as Point).coordinates as [number, number]).setHTML(html([`<b>${p.name}</b> · ${p.role}`, `<span style="color:${T.muted}">${p.status}${p.on ? ` · on ${p.on}` : ''} · seen ${p.agem} min ago</span>`])).addTo(map);
        });
        map.on('mouseleave', 'responders', () => popup.remove());
        map.on('mousemove', 'stations', e => {
          const p = e.features?.[0]?.properties as Record<string, string> | undefined;
          if (!p) return;
          popup.setLngLat((e.features![0].geometry as Point).coordinates as [number, number]).setHTML(html([`<b>${p.name}</b>`, `<span style="color:${T.muted}">${p.verified === 'true' ? 'verified station' : 'station — not yet verified'}</span>`])).addTo(map);
        });
        map.on('mouseleave', 'stations', () => popup.remove());
        map.on('mousemove', 'hotspots', e => {
          const p = e.features?.[0]?.properties as Record<string, string> | undefined;
          if (!p) return;
          popup.setLngLat((e.features![0].geometry as Point).coordinates as [number, number]).setHTML(html([`<b>${p.reported} reports</b>${Number(p.critical) > 0 ? ` · ${p.critical} critical` : ''}`, `<span style="color:${T.muted}">${p.place || 'about two kilometres across'}${p.category ? ` · mostly ${p.category.toLowerCase()}` : ''}</span>`])).addTo(map);
        });
        map.on('mouseleave', 'hotspots', () => popup.remove());
      }
      loaded.current = true;
      feed();
    });
  };

  const feed = () => {
    const map = mapRef.current;
    if (!map || !loaded.current) return;
    if (areas) (map.getSource('areas') as maplibregl.GeoJSONSource | undefined)?.setData(areas);
    (map.getSource('incidents') as maplibregl.GeoJSONSource | undefined)?.setData(incidents);
    (map.getSource('responders') as maplibregl.GeoJSONSource | undefined)?.setData(responders);
    (map.getSource('stations') as maplibregl.GeoJSONSource | undefined)?.setData(stationFc);
    (map.getSource('hotspots') as maplibregl.GeoJSONSource | undefined)?.setData(hotspotFc);
    if (fit && !fitted.current) {
      const pts = [...incidents.features, ...responders.features, ...stationFc.features, ...hotspotFc.features].map(f => (f.geometry as Point).coordinates as [number, number]);
      if (pts.length > 0) {
        const b = pts.reduce((acc, p) => acc.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]));
        map.fitBounds(b, { padding: 60, maxZoom: 11, duration: 600 });
        fitted.current = true;
      }
    }
  };
  useEffect(feed, [areas, incidents, responders, stationFc, hotspotFc, fit]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (focus && mapRef.current) mapRef.current.flyTo({ center: focus, zoom: Math.max(mapRef.current.getZoom(), 11), duration: 700 });
  }, [focus]);

  return <div ref={divRef} style={{ width: '100%', height, background: '#0a1018' }} />;
}
