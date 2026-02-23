import { useEffect, useRef, useState, useCallback } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { api } from '../services/api';

// No Ion token
Cesium.Ion.defaultAccessToken = undefined;

export default function CesiumGlobe({ telemetry }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const entityRef = useRef(null);
  const orbitLineRef = useRef(null);
  const groundTrackRef = useRef(null);
  const [tracking, setTracking] = useState(false);
  const [inEclipse, setInEclipse] = useState(false);
  const stationsAddedRef = useRef(false);

  // Initialize Cesium viewer
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    const viewer = new Cesium.Viewer(containerRef.current, {
      baseLayer: false,
      terrain: undefined,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      creditContainer: document.createElement('div'),
      skyBox: false,
      skyAtmosphere: new Cesium.SkyAtmosphere(),
      orderIndependentTranslucency: false,
      msaaSamples: 4,
      useBrowserRecommendedResolution: true,
      requestRenderMode: false,
    });

    // Crisp rendering — cap at 1.5x to avoid GPU overload
    viewer.resolutionScale = Math.min(window.devicePixelRatio || 1.0, 1.5);

    // Add real Earth satellite imagery (ArcGIS World Imagery - free, high quality)
    viewer.imageryLayers.addImageryProvider(
      new Cesium.UrlTemplateImageryProvider({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        maximumLevel: 19,
        credit: 'Esri, Maxar, Earthstar Geographics',
      })
    );

    // === REALISTIC ECLIPSE: Enable sun-based lighting ===
    viewer.scene.globe.enableLighting = true;
    viewer.clock.shouldAnimate = true;
    // Sync Cesium clock to real current time
    viewer.clock.currentTime = Cesium.JulianDate.now();
    viewer.clock.multiplier = 1; // real-time

    // Scene quality
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#000000');
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#0a101f');
    viewer.scene.globe.showGroundAtmosphere = true;

    // Atmosphere glow
    viewer.scene.skyAtmosphere.brightnessShift = 0.0;
    viewer.scene.skyAtmosphere.hueShift = 0.0;
    viewer.scene.skyAtmosphere.saturationShift = 0.0;

    // Enable HDR for better lighting contrast
    viewer.scene.highDynamicRange = true;

    // Enable sun and moon
    viewer.scene.sun = new Cesium.Sun();
    viewer.scene.moon = new Cesium.Moon();
    viewer.scene.sun.show = true;

    // Globe rendering quality
    viewer.scene.globe.maximumScreenSpaceError = 1.5; // sharper tiles (default is 2)
    viewer.scene.fxaa = true; // anti-aliasing

    // Night side dim lighting (makes eclipse visible)
    viewer.scene.globe.nightFadeOutDistance = 1e7;
    viewer.scene.globe.nightFadeInDistance = 5e7;

    // Satellite entity
    entityRef.current = viewer.entities.add({
      name: 'DISHA-SAT-01',
      position: Cesium.Cartesian3.fromDegrees(78, 20, 622000),
      point: {
        pixelSize: 10,
        color: Cesium.Color.fromCssColorString('#22d3ee'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 1,
      },
      label: {
        text: 'DISHA-SAT-01',
        font: '11px JetBrains Mono, monospace',
        fillColor: Cesium.Color.fromCssColorString('#0ea5e9'),
        style: Cesium.LabelStyle.FILL,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -14),
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('#000000').withAlpha(0.6),
        backgroundPadding: new Cesium.Cartesian2(6, 4),
      },
    });

    // Orbit prediction line
    orbitLineRef.current = viewer.entities.add({
      polyline: {
        positions: [],
        width: 1.5,
        material: new Cesium.ColorMaterialProperty(
          Cesium.Color.fromCssColorString('#0ea5e9').withAlpha(0.4)
        ),
      },
    });

    // Ground track
    groundTrackRef.current = viewer.entities.add({
      polyline: {
        positions: [],
        width: 1,
        material: new Cesium.PolylineDashMaterialProperty({
          color: Cesium.Color.fromCssColorString('#22d3ee').withAlpha(0.15),
          dashLength: 16,
        }),
        clampToGround: true,
      },
    });

    // Initial camera
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(78, 20, 20000000),
      duration: 0,
    });

    viewerRef.current = viewer;

    // Add ground station markers
    if (!stationsAddedRef.current) {
      stationsAddedRef.current = true;
      api.getGroundStations().then((data) => {
        if (!data || !data.stations || !viewerRef.current) return;
        data.stations.forEach((gs) => {
          viewerRef.current.entities.add({
            name: gs.name,
            position: Cesium.Cartesian3.fromDegrees(gs.lon, gs.lat, 0),
            point: {
              pixelSize: 7,
              color: Cesium.Color.fromCssColorString('#ff6b35'),
              outlineColor: Cesium.Color.fromCssColorString('#ff6b35').withAlpha(0.4),
              outlineWidth: 3,
            },
            label: {
              text: gs.name,
              font: '10px JetBrains Mono, monospace',
              fillColor: Cesium.Color.fromCssColorString('#ff6b35'),
              style: Cesium.LabelStyle.FILL,
              verticalOrigin: Cesium.VerticalOrigin.TOP,
              pixelOffset: new Cesium.Cartesian2(0, 10),
              showBackground: true,
              backgroundColor: Cesium.Color.BLACK.withAlpha(0.5),
              backgroundPadding: new Cesium.Cartesian2(4, 3),
              scale: 0.9,
            },
          });
        });
      });
    }

    return () => {
      viewer.destroy();
      viewerRef.current = null;
    };
  }, []);

  // Update satellite position
  useEffect(() => {
    if (!telemetry || !entityRef.current) return;

    const { latitude, longitude, altitude_km } = telemetry;
    const pos = Cesium.Cartesian3.fromDegrees(
      longitude, latitude, altitude_km * 1000
    );
    entityRef.current.position = pos;

    // Eclipse detection: check if satellite is in Earth's shadow
    if (viewerRef.current) {
      const sunPos = Cesium.Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(
        viewerRef.current.clock.currentTime
      );
      if (sunPos) {
        const satCartesian = pos;
        const sunDir = Cesium.Cartesian3.normalize(sunPos, new Cesium.Cartesian3());
        const satDir = Cesium.Cartesian3.normalize(satCartesian, new Cesium.Cartesian3());
        const dot = Cesium.Cartesian3.dot(sunDir, satDir);
        // Simple cylindrical shadow: satellite is in eclipse when on opposite side of Earth from Sun
        const earthRadius = 6371000;
        const satDist = Cesium.Cartesian3.magnitude(satCartesian);
        const shadowAngle = Math.asin(earthRadius / satDist);
        const sunAngle = Math.acos(Math.max(-1, Math.min(1, dot)));
        setInEclipse(sunAngle > Math.PI / 2 + shadowAngle);
      }
    }

    if (tracking && viewerRef.current) {
      viewerRef.current.camera.lookAt(
        pos,
        new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-30), altitude_km * 1000 * 3)
      );
    }
  }, [telemetry, tracking]);

  // Fetch orbit prediction periodically
  useEffect(() => {
    let active = true;

    const fetchOrbit = async () => {
      const data = await api.getOrbitPrediction();
      if (!active || !data || !data.points) return;

      const positions = [];
      const groundPositions = [];

      for (const p of data.points) {
        positions.push(Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.alt_km * 1000));
        groundPositions.push(Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 0));
      }

      if (orbitLineRef.current) {
        orbitLineRef.current.polyline.positions = positions;
      }
      if (groundTrackRef.current) {
        groundTrackRef.current.polyline.positions = groundPositions;
      }
    };

    fetchOrbit();
    const id = setInterval(fetchOrbit, 30000);

    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const toggleTracking = useCallback(() => {
    setTracking((prev) => {
      if (prev && viewerRef.current) {
        viewerRef.current.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
      }
      return !prev;
    });
  }, []);

  return (
    <div className="cesium-panel">
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Overlay stats */}
      {telemetry && (
        <>
          <div className="map-overlay-stats">
            <div className="map-stat-chip">
              ALT <span className="value">{telemetry.altitude_km.toFixed(1)} km</span>
            </div>
            <div className="map-stat-chip">
              VEL <span className="value">{telemetry.speed_km_s.toFixed(2)} km/s</span>
            </div>
            <div className={`map-stat-chip ${inEclipse ? 'eclipse-active' : 'sunlit-active'}`}>
              {inEclipse ? '🌑 ECLIPSE' : '☀️ SUNLIT'}
            </div>
            <button
              className={`map-stat-chip ${tracking ? 'tracking-active' : ''}`}
              onClick={toggleTracking}
              style={{ cursor: 'pointer', border: tracking ? '1px solid #22d3ee' : undefined }}
            >
              {tracking ? 'TRACKING' : 'TRACK SAT'}
            </button>
          </div>

          <div className="orbit-info-overlay">
            <div className="orbit-stat">
              <div className="orbit-stat-label">Latitude</div>
              <div className="orbit-stat-value">{telemetry.latitude.toFixed(4)}</div>
            </div>
            <div className="orbit-stat">
              <div className="orbit-stat-label">Longitude</div>
              <div className="orbit-stat-value">{telemetry.longitude.toFixed(4)}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
