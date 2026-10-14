/**
 * One incident on a map, worked.
 *
 * The pin as it is now; where the report was made when the reporter has moved since; the
 * trail between them; the responsible station; the people going and where they were last
 * seen; and, when the desk asks, the way there — a road from the routing host, or a straight
 * line that says it is one. A reporter who is sharing live moves the pin while the desk
 * watches, and the map keeps them in view unless the desk has taken the wheel.
 *
 * Draws nothing it was not given. The route is asked for by the panel, through the sealed
 * API, and handed in; the map never talks to a server itself.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { resolveStyle } from './LiveMap';
import { T } from './theme';
import type { AssignmentRow, DeskIncident, RoutePlan } from './api';

export type IncidentMapProps = {
  inc: DeskIncident;
  route: RoutePlan | null;
  height?: number | string;
  /** Keep the latest pin in view as it moves. The desk switches it off by dragging. */
  follow?: boolean;
  onUserMoved?: () => void;
};

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

export function IncidentMap({ inc, route, height = 360, follow = true, onUserMoved }: IncidentMapProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loaded = useRef(false);
  const [ready, setReady] = useState(false);
  const userMovedRef = useRef(onUserMoved);
  userMovedRef.current = onUserMoved;

  const here = inc.latitude !== null && inc.longitude !== null ? [inc.longitude, inc.latitude] as [number, number] : null;
  const origin = inc.originLatitude != null && inc.originLongitude != null ? [inc.originLongitude, inc.originLatitude] as [number, number] : null;
  const station = inc.facilityLatitude != null && inc.facilityLongitude != null ? [inc.facilityLongitude, inc.facilityLatitude] as [number, number] : null;
  const going = (inc.assignments ?? []).filter(a => a.latitude !== null && a.longitude !== null && [1, 2, 3, 4, 5].includes(a.status));

  const pointFc = useMemo<FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: [
      ...(station ? [{ type: 'Feature' as const, properties: { kind: 'station', label: inc.card.facilityName ?? 'Station' }, geometry: { type: 'Point' as const, coordinates: station } }] : []),
      ...(origin && here && (Math.abs(origin[0] - here[0]) > 1e-5 || Math.abs(origin[1] - here[1]) > 1e-5)
        ? [{ type: 'Feature' as const, properties: { kind: 'origin', label: 'Reported here' }, geometry: { type: 'Point' as const, coordinates: origin } }] : []),
      ...going.map((a: AssignmentRow) => ({ type: 'Feature' as const, properties: { kind: 'responder', label: a.responderName ?? a.vehicleCallSign ?? 'Responder', age: a.locationAgeMinutes ?? 0 }, geometry: { type: 'Point' as const, coordinates: [a.longitude as number, a.latitude as number] } })),
      ...(here ? [{ type: 'Feature' as const, properties: { kind: 'incident', label: inc.card.number, live: !!inc.following, colour: inc.card.severity === 1 ? T.bad : inc.card.severity === 2 ? T.warn : T.accent }, geometry: { type: 'Point' as const, coordinates: here } }] : []),
    ],
  }), [inc, here?.[0], here?.[1], origin?.[0], origin?.[1], station?.[0], station?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  const trailFc = useMemo<FeatureCollection>(() => {
    const pts = (inc.trail ?? []).map(p => [p.longitude, p.latitude] as [number, number]);
    if (here && (pts.length === 0 || pts[pts.length - 1][0] !== here[0] || pts[pts.length - 1][1] !== here[1])) pts.push(here);
    return pts.length >= 2 ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts } }] } : EMPTY;
  }, [inc.trail, here?.[0], here?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  const routeFc = useMemo<FeatureCollection>(() => route && route.points.length >= 2
    ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { straight: route.straight }, geometry: { type: 'LineString', coordinates: route.points.map(p => [p[1], p[0]]) } }] }
    : EMPTY, [route]);

  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    let gone = false;
    let map: maplibregl.Map | null = null;
    void resolveStyle().then(style => {
      if (gone || !divRef.current) return;
      map = new maplibregl.Map({ container: divRef.current, style, center: here ?? station ?? [-13.23, 8.48], zoom: here ? 14 : 11, attributionControl: { compact: true } });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      map.on('dragstart', () => userMovedRef.current?.());
      map.on('wheel', () => userMovedRef.current?.());
      map.on('load', () => {
        map!.addSource('trail', { type: 'geojson', data: EMPTY });
        map!.addLayer({ id: 'trail-halo', type: 'line', source: 'trail', paint: { 'line-color': T.bg, 'line-width': 6, 'line-opacity': 0.6 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
        map!.addLayer({ id: 'trail', type: 'line', source: 'trail', paint: { 'line-color': T.accent, 'line-width': 2.5, 'line-opacity': 0.9 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
        map!.addSource('route', { type: 'geojson', data: EMPTY });
        map!.addLayer({ id: 'route-halo', type: 'line', source: 'route', paint: { 'line-color': T.bg, 'line-width': 8, 'line-opacity': 0.7 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
        map!.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': T.good, 'line-width': 4, 'line-dasharray': ['case', ['get', 'straight'], ['literal', [1, 2]], ['literal', [1, 0]]] as never }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
        map!.addSource('points', { type: 'geojson', data: EMPTY });
        map!.addLayer({ id: 'pt-station', type: 'circle', source: 'points', filter: ['==', ['get', 'kind'], 'station'], paint: { 'circle-radius': 6, 'circle-color': T.bg, 'circle-stroke-color': T.text, 'circle-stroke-width': 2 } });
        map!.addLayer({ id: 'pt-origin', type: 'circle', source: 'points', filter: ['==', ['get', 'kind'], 'origin'], paint: { 'circle-radius': 7, 'circle-color': 'transparent', 'circle-stroke-color': T.muted, 'circle-stroke-width': 2, 'circle-stroke-opacity': 0.9 } });
        map!.addLayer({ id: 'pt-responder', type: 'circle', source: 'points', filter: ['==', ['get', 'kind'], 'responder'], paint: { 'circle-radius': 5.5, 'circle-color': T.good, 'circle-stroke-color': T.bg, 'circle-stroke-width': 1.5 } });
        map!.addLayer({ id: 'pt-live', type: 'circle', source: 'points', filter: ['all', ['==', ['get', 'kind'], 'incident'], ['==', ['get', 'live'], true]], paint: { 'circle-radius': 18, 'circle-color': ['get', 'colour'], 'circle-opacity': 0.18, 'circle-blur': 0.5 } });
        map!.addLayer({ id: 'pt-incident', type: 'circle', source: 'points', filter: ['==', ['get', 'kind'], 'incident'], paint: { 'circle-radius': 8, 'circle-color': ['get', 'colour'], 'circle-stroke-color': T.text, 'circle-stroke-width': 2 } });
        map!.addLayer({ id: 'pt-label', type: 'symbol', source: 'points', layout: { 'text-field': ['get', 'label'], 'text-size': 11, 'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-allow-overlap': true } as never, paint: { 'text-color': T.text, 'text-halo-color': T.bg, 'text-halo-width': 1.3 } });
        loaded.current = true;
        setReady(true);
      });
    });
    return () => { gone = true; map?.remove(); mapRef.current = null; loaded.current = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Feed what changed. The pin moving is the common case: setData is cheap and never
  // re-creates the map, so the desk's zoom survives.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded.current) return;
    (map.getSource('points') as maplibregl.GeoJSONSource | undefined)?.setData(pointFc);
    (map.getSource('trail') as maplibregl.GeoJSONSource | undefined)?.setData(trailFc);
    (map.getSource('route') as maplibregl.GeoJSONSource | undefined)?.setData(routeFc);
  }, [pointFc, trailFc, routeFc, ready]);

  // Fit once there is a route (both ends in view), otherwise keep a moving pin in view.
  const fittedRoute = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (route && route.points.length >= 2 && fittedRoute.current !== route.asOf) {
      const b = route.points.reduce((acc, p) => acc.extend([p[1], p[0]]), new maplibregl.LngLatBounds([route.points[0][1], route.points[0][0]], [route.points[0][1], route.points[0][0]]));
      map.fitBounds(b, { padding: 50, maxZoom: 15, duration: 600 });
      fittedRoute.current = route.asOf;
      return;
    }
    if (follow && here && !route) {
      const c = map.getCenter();
      if (Math.abs(c.lng - here[0]) > 0.0008 || Math.abs(c.lat - here[1]) > 0.0008) map.easeTo({ center: here, duration: 500 });
    }
  }, [here?.[0], here?.[1], route, follow, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={divRef} style={{ width: '100%', height, background: '#0a1018', borderRadius: 9, overflow: 'hidden', border: `1px solid ${T.line}` }} />;
}
