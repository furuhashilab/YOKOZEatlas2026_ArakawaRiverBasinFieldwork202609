import * as maplibregl from "https://unpkg.com/maplibre-gl@6.10.0/dist/maplibre-gl.mjs";

const DATA_URL = "./data/YOKOZEatlas2026_morigawa_water_quality_v0.1.0.geojson";
const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const TOUR_INTERVAL_MS = 9000;
const TOUR_CAMERA_DURATION_MS = 4600;
const TOUR_POPUP_DELAY_MS = 3400;
const GSI_STYLE = {
  version: 8,
  name: "地理院地図 標準地図",
  sources: {
    gsi: {
      type: "raster",
      tiles: ["https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png"],
      tileSize: 256,
      minzoom: 2,
      maxzoom: 18,
      attribution:
        '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">地理院タイル</a>',
    },
  },
  layers: [
    {
      id: "gsi-background",
      type: "background",
      paint: { "background-color": "#e8eeea" },
    },
    {
      id: "gsi-standard",
      type: "raster",
      source: "gsi",
      paint: { "raster-opacity": 1 },
    },
  ],
};

const CLASS_COLORS = {
  water_quality_sample: "#147b8d",
  water_feature: "#56b7c3",
  other_observation: "#d3903f",
};

const CLASS_LABELS = {
  water_quality_sample: "水質測定地点",
  water_feature: "水環境の観察地点",
  other_observation: "その他の観察地点",
};

const TYPE_LABELS = {
  rainwater: "雨水",
  spring_water: "湧水・伏流水",
  geology: "地質",
  vegetation: "植生",
  tap_water: "水道水・引水",
  well: "井戸",
  spring_pond: "湧水池",
  spring_channel: "湧水・水路",
  cultural_feature: "文化的地物",
};

const QC_LABELS = {
  outside_yokoze_town: "横瀬町外",
  no_water_measurement: "水質測定なし",
  duplicate_coordinates_distinct_samples: "同一座標の別サンプル",
  cfg_match_distance_gt_50m: "CfGとの座標距離50m超",
  elevation_difference_gt_20m: "測定機器間の標高差20m超",
  cfg_nearest_point_override_reviewed: "名称・時刻で統合先を確認済み",
  cfg_name_alias_reviewed: "異名の同一採水地点として確認済み",
};

const state = {
  data: null,
  filteredData: null,
  projection: "globe",
  basemap: "openfreemap",
  interactionsBound: false,
  tourPlaying: false,
  tourIndex: -1,
  tourTimer: null,
  tourPopupTimer: null,
};

const elements = {
  loading: document.querySelector("#loading-panel"),
  error: document.querySelector("#error-panel"),
  search: document.querySelector("#search-input"),
  municipality: document.querySelector("#municipality-filter"),
  measuredOnly: document.querySelector("#measured-only"),
  cfgOnly: document.querySelector("#cfg-only"),
  classInputs: [...document.querySelectorAll('input[name="feature-class"]')],
  reset: document.querySelector("#reset-filters"),
  resultList: document.querySelector("#result-list"),
  resultCount: document.querySelector("#result-count"),
  tourPlay: document.querySelector("#tour-play"),
  tourPause: document.querySelector("#tour-pause"),
  tourStatus: document.querySelector("#tour-status"),
  statVisible: document.querySelector("#stat-visible"),
  statMeasured: document.querySelector("#stat-measured"),
  statYokoze: document.querySelector("#stat-yokoze"),
  statCfg: document.querySelector("#stat-cfg"),
  basemap: document.querySelector("#basemap-select"),
  projection: document.querySelector("#projection-toggle"),
  fit: document.querySelector("#fit-data"),
  sidebar: document.querySelector("#sidebar"),
  sidebarToggle: document.querySelector("#sidebar-toggle"),
  sidebarScrim: document.querySelector("#sidebar-scrim"),
};

const map = new maplibregl.Map({
  container: "map",
  style: OPENFREEMAP_STYLE,
  center: [139.0895, 35.997],
  zoom: 12.2,
  pitch: 0,
  bearing: 0,
  attributionControl: false,
  cooperativeGestures: true,
  maxPitch: 70,
});

map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
map.addControl(
  new maplibregl.AttributionControl({
    compact: true,
    customAttribution:
      '<a href="./LICENSE" target="_blank" rel="noreferrer">ウェブマップ: CC0</a> | データライセンス確認中',
  }),
  "bottom-right",
);

const popup = new maplibregl.Popup({
  closeButton: true,
  closeOnClick: true,
  maxWidth: "370px",
  offset: 13,
});

function hasValue(value) {
  return value !== null && value !== undefined && value !== "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatNumber(value, digits = 1) {
  if (!hasValue(value) || !Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("ja-JP", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(Number(value));
}

function formatDateTime(value) {
  if (!hasValue(value)) return "—";
  return String(value).replace("T", " ").slice(0, 19);
}

function popupRows(rows) {
  const visibleRows = rows.filter(([, value]) => hasValue(value));
  if (!visibleRows.length) return "";
  return `<dl class="popup-grid">${visibleRows
    .map(
      ([label, value]) =>
        `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`,
    )
    .join("")}</dl>`;
}

function popupSection(title, rows) {
  const content = popupRows(rows);
  if (!content) return "";
  return `<section class="popup-section"><h4>${escapeHtml(title)}</h4>${content}</section>`;
}

function buildPopupHtml(properties) {
  const classLabel = CLASS_LABELS[properties.feature_class] || properties.feature_class;
  const typeLabel = TYPE_LABELS[properties.feature_type] || properties.feature_type;
  const fieldRows = [
    ["水温", hasValue(properties.water_temp_field_c) ? `${formatNumber(properties.water_temp_field_c)} ℃` : null],
    ["電気伝導度", hasValue(properties.conductivity_field_us_cm) ? `${formatNumber(properties.conductivity_field_us_cm, 2)} μS/cm` : null],
    ["pH", hasValue(properties.ph_field) ? formatNumber(properties.ph_field, 2) : null],
    ["RpH", hasValue(properties.rph_field) ? formatNumber(properties.rph_field, 2) : null],
    ["RpH - pH", hasValue(properties.ph_difference) ? formatNumber(properties.ph_difference, 2) : null],
    ["標高", hasValue(properties.elevation_field_m) ? `${formatNumber(properties.elevation_field_m)} m` : null],
  ];
  const cfgRows = [
    ["測定日時", hasValue(properties.cfg_observed_at) ? formatDateTime(properties.cfg_observed_at) : null],
    ["NO3濃度", hasValue(properties.nitrate_mg_l) ? `${formatNumber(properties.nitrate_mg_l, 3)} mg/L` : null],
    ["水温", hasValue(properties.water_temp_cfg_c) ? `${formatNumber(properties.water_temp_cfg_c)} ℃` : null],
    ["電気伝導度", hasValue(properties.conductivity_cfg_us_cm) ? `${formatNumber(properties.conductivity_cfg_us_cm, 2)} μS/cm` : null],
    ["pH", hasValue(properties.ph_cfg) ? formatNumber(properties.ph_cfg, 2) : null],
    ["pH再測定", hasValue(properties.ph_cfg_retest) ? formatNumber(properties.ph_cfg_retest, 2) : null],
    ["ORP", hasValue(properties.orp_mv) ? `${formatNumber(properties.orp_mv)} mV` : null],
    ["標高", hasValue(properties.cfg_elevation_m) ? `${formatNumber(properties.cfg_elevation_m)} m` : null],
  ];
  const flags = String(properties.qc_flags || "")
    .split(";")
    .map((flag) => flag.trim())
    .filter(Boolean);
  const flagHtml = flags
    .map((flag) => `<span class="popup-flag">${escapeHtml(QC_LABELS[flag] || flag)}</span>`)
    .join("");
  const remarks = hasValue(properties.remarks)
    ? `<p class="popup-note">${escapeHtml(properties.remarks).replaceAll("\n", "<br>")}</p>`
    : "";

  return `
    <article>
      <header class="popup-header">
        <p class="popup-kicker">${escapeHtml(classLabel)} / ${escapeHtml(typeLabel)}</p>
        <h3>${escapeHtml(properties.name)}</h3>
      </header>
      <div class="popup-body">
        <p class="popup-meta">
          ${escapeHtml(properties.address || properties.municipality || "")}
          <br>${escapeHtml(formatDateTime(properties.observed_at))}
        </p>
        ${popupSection("現地調査", fieldRows)}
        ${properties.cfg_matched ? popupSection("Code for Ground測定", cfgRows) : ""}
        ${remarks}
        ${flagHtml}
      </div>
    </article>
  `;
}

function showFeaturePopup(feature) {
  const coordinates = feature.geometry.coordinates;
  popup.setLngLat(coordinates).setHTML(buildPopupHtml(feature.properties)).addTo(map);
}

function openFeature(feature, options = {}) {
  const coordinates = feature.geometry.coordinates;
  if (options.showPopup !== false) showFeaturePopup(feature);
  if (options.fly !== false) {
    const cameraOptions = {
      center: coordinates,
      zoom: options.zoom ?? Math.max(map.getZoom(), 15),
      essential: options.essential ?? true,
    };
    ["pitch", "bearing", "duration", "curve"].forEach((key) => {
      if (Number.isFinite(options[key])) cameraOptions[key] = options[key];
    });
    if (typeof options.easing === "function") cameraOptions.easing = options.easing;
    map.flyTo(cameraOptions);
  }
  if (options.updateHash !== false) {
    history.replaceState(null, "", `#${encodeURIComponent(feature.properties.feature_id)}`);
  }
}

function addDataLayers() {
  if (!state.filteredData || map.getSource("fieldwork")) return;

  map.addSource("fieldwork", {
    type: "geojson",
    data: state.filteredData,
    cluster: true,
    clusterMaxZoom: 13,
    clusterRadius: 42,
  });

  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "fieldwork",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": [
        "step",
        ["get", "point_count"],
        "#69b7be",
        5,
        "#268795",
        10,
        "#0b4f5c",
      ],
      "circle-radius": ["step", ["get", "point_count"], 16, 5, 20, 10, 24],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
      "circle-opacity": 0.94,
    },
  });

  if (!state.interactionsBound) {
    bindMapInteractions();
    state.interactionsBound = true;
  }

  if (state.basemap === "openfreemap") {
    map.addLayer({
      id: "cluster-count",
      type: "symbol",
      source: "fieldwork",
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-size": 12,
      },
      paint: { "text-color": "#ffffff" },
    });
  }

  map.addLayer({
    id: "unclustered-point-halo",
    type: "circle",
    source: "fieldwork",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 7, 15, 11],
      "circle-color": "#ffffff",
      "circle-opacity": 0.9,
    },
  });

  map.addLayer({
    id: "unclustered-point",
    type: "circle",
    source: "fieldwork",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 5, 15, 8],
      "circle-color": [
        "match",
        ["get", "feature_class"],
        "water_quality_sample",
        CLASS_COLORS.water_quality_sample,
        "water_feature",
        CLASS_COLORS.water_feature,
        "other_observation",
        CLASS_COLORS.other_observation,
        "#77858a",
      ],
      "circle-stroke-width": 1,
      "circle-stroke-color": "#ffffff",
      "circle-opacity": 0.96,
    },
  });
}

function updateMapSource() {
  const source = map.getSource("fieldwork");
  if (source) source.setData(state.filteredData);
  else if (map.isStyleLoaded()) addDataLayers();
}

function fitToFeatures(features = state.filteredData?.features) {
  if (!features?.length) return;
  const bounds = new maplibregl.LngLatBounds();
  features.forEach((feature) => bounds.extend(feature.geometry.coordinates));
  map.fitBounds(bounds, {
    padding: window.innerWidth < 760 ? 54 : 70,
    maxZoom: 14.5,
    duration: 800,
  });
}

function selectedClasses() {
  return new Set(elements.classInputs.filter((input) => input.checked).map((input) => input.value));
}

function normalizeSearch(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("ja")
    .replaceAll(/\s+/g, "");
}

function featureSearchText(properties) {
  return normalizeSearch(
    [
      properties.name,
      properties.address,
      properties.remarks,
      properties.cfg_location_label,
      TYPE_LABELS[properties.feature_type],
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function filterData() {
  if (!state.data) return;
  const query = normalizeSearch(elements.search.value);
  const municipality = elements.municipality.value;
  const classes = selectedClasses();

  const features = state.data.features.filter((feature) => {
    const properties = feature.properties;
    if (!classes.has(properties.feature_class)) return false;
    if (municipality !== "all" && properties.municipality !== municipality) return false;
    if (elements.measuredOnly.checked && !properties.has_water_measurement) return false;
    if (elements.cfgOnly.checked && !properties.cfg_matched) return false;
    if (query && !featureSearchText(properties).includes(query)) return false;
    return true;
  });

  state.filteredData = { ...state.data, features };
  pauseTour({ reset: true, closePopup: true });
  updateMapSource();
  updateSummary(features);
  renderResults(features);
}

function updateSummary(features) {
  const properties = features.map((feature) => feature.properties);
  elements.statVisible.textContent = String(features.length);
  elements.statMeasured.textContent = String(
    properties.filter((item) => item.has_water_measurement).length,
  );
  elements.statYokoze.textContent = String(
    properties.filter((item) => item.in_yokoze_town).length,
  );
  elements.statCfg.textContent = String(properties.filter((item) => item.cfg_matched).length);
  elements.resultCount.textContent = `${features.length}件`;
}

function dotClass(featureClass) {
  if (featureClass === "water_quality_sample") return "sample";
  if (featureClass === "water_feature") return "water";
  return "other";
}

function clearTourTimer() {
  if (state.tourTimer !== null) {
    window.clearTimeout(state.tourTimer);
    state.tourTimer = null;
  }
}

function clearTourPopupTimer() {
  if (state.tourPopupTimer !== null) {
    window.clearTimeout(state.tourPopupTimer);
    state.tourPopupTimer = null;
  }
}

function clearTourTimers() {
  clearTourTimer();
  clearTourPopupTimer();
}

function updateTourControls() {
  const count = state.filteredData?.features.length || 0;
  elements.tourPlay.disabled = !count || state.tourPlaying;
  elements.tourPause.disabled = !state.tourPlaying;

  if (!count) {
    elements.tourStatus.textContent = "対象地点なし";
  } else if (state.tourIndex >= 0 && state.tourIndex < count) {
    const status = state.tourPlaying ? "再生中" : "一時停止中";
    elements.tourStatus.textContent = `${status} ${state.tourIndex + 1} / ${count}`;
  } else {
    elements.tourStatus.textContent = `${count}地点`;
  }
}

function setActiveResult(featureId, options = {}) {
  let activeButton = null;
  elements.resultList.querySelectorAll(".result-item").forEach((button) => {
    const isActive = button.dataset.featureId === featureId;
    button.classList.toggle("is-active", isActive);
    if (isActive) {
      button.setAttribute("aria-current", "location");
      activeButton = button;
    } else {
      button.removeAttribute("aria-current");
    }
  });
  if (activeButton && options.scroll !== false) {
    activeButton.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

function pauseTour(options = {}) {
  clearTourTimers();
  state.tourPlaying = false;
  map.stop();
  if (options.reset) {
    state.tourIndex = -1;
    setActiveResult(null, { scroll: false });
  }
  if (options.closePopup) {
    popup.remove();
    if (location.hash) {
      history.replaceState(null, "", `${location.pathname}${location.search}`);
    }
  } else if (options.revealPopup) {
    const feature = state.filteredData?.features[state.tourIndex];
    if (feature) showFeaturePopup(feature);
  }
  updateTourControls();
}

function scheduleNextTourFeature() {
  clearTourTimer();
  if (!state.tourPlaying) return;
  state.tourTimer = window.setTimeout(() => {
    const count = state.filteredData?.features.length || 0;
    if (!count) {
      pauseTour({ reset: true });
      return;
    }
    showTourFeature((state.tourIndex + 1) % count);
  }, TOUR_INTERVAL_MS);
}

function smoothCameraEasing(progress) {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function wrapBearing(bearing) {
  return ((bearing + 180) % 360 + 360) % 360 - 180;
}

function createTourCameraOptions() {
  const direction = Math.random() < 0.5 ? -1 : 1;
  const turn = 65 + Math.random() * 110;
  return {
    zoom: 15.25 + Math.random() * 0.55,
    pitch: 56 + Math.random() * 9,
    bearing: wrapBearing(map.getBearing() + direction * turn),
    duration: TOUR_CAMERA_DURATION_MS,
    curve: 1.55 + Math.random() * 0.25,
    easing: smoothCameraEasing,
    essential: false,
    showPopup: false,
  };
}

function showTourFeature(index) {
  const features = state.filteredData?.features || [];
  if (!features.length) {
    pauseTour({ reset: true });
    return;
  }

  state.tourIndex = ((index % features.length) + features.length) % features.length;
  const feature = features[state.tourIndex];
  clearTourPopupTimer();
  popup.remove();
  openFeature(feature, createTourCameraOptions());
  setActiveResult(feature.properties.feature_id);
  updateTourControls();
  state.tourPopupTimer = window.setTimeout(() => {
    const currentFeature = state.filteredData?.features[state.tourIndex];
    if (
      state.tourPlaying &&
      currentFeature?.properties.feature_id === feature.properties.feature_id
    ) {
      showFeaturePopup(feature);
    }
    state.tourPopupTimer = null;
  }, TOUR_POPUP_DELAY_MS);
  scheduleNextTourFeature();
}

function startTour() {
  const count = state.filteredData?.features.length || 0;
  if (!count || state.tourPlaying) return;
  state.tourPlaying = true;
  const nextIndex = state.tourIndex >= 0 ? (state.tourIndex + 1) % count : 0;
  showTourFeature(nextIndex);
  closeSidebar();
}

function renderResults(features) {
  elements.resultList.replaceChildren();
  if (!features.length) {
    const empty = document.createElement("p");
    empty.className = "empty-results";
    empty.textContent = "条件に合う地点はありません。";
    elements.resultList.append(empty);
    updateTourControls();
    return;
  }

  const fragment = document.createDocumentFragment();
  features.forEach((feature, index) => {
    const properties = feature.properties;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "result-item";
    button.dataset.featureId = properties.feature_id;
    button.innerHTML = `
      <span class="result-item-title">
        <i class="legend-dot ${dotClass(properties.feature_class)}" aria-hidden="true"></i>
        <span>${escapeHtml(properties.name)}</span>
      </span>
      <span class="result-item-meta">
        ${escapeHtml(properties.municipality)} ・ ${escapeHtml(TYPE_LABELS[properties.feature_type] || properties.feature_type)}
      </span>
    `;
    button.addEventListener("click", () => {
      pauseTour();
      state.tourIndex = index;
      openFeature(feature);
      setActiveResult(properties.feature_id);
      updateTourControls();
      closeSidebar();
    });
    fragment.append(button);
  });
  elements.resultList.append(fragment);
  updateTourControls();
}

function resetFilters() {
  elements.search.value = "";
  elements.municipality.value = "all";
  elements.measuredOnly.checked = false;
  elements.cfgOnly.checked = false;
  elements.classInputs.forEach((input) => {
    input.checked = true;
  });
  filterData();
  fitToFeatures(state.data?.features);
}

function openSidebar() {
  elements.sidebar.classList.add("is-open");
  elements.sidebarToggle.setAttribute("aria-expanded", "true");
  elements.sidebarScrim.hidden = false;
}

function closeSidebar() {
  elements.sidebar.classList.remove("is-open");
  elements.sidebarToggle.setAttribute("aria-expanded", "false");
  elements.sidebarScrim.hidden = true;
}

function setProjection() {
  if (!map.isStyleLoaded()) return;
  map.setProjection({ type: state.projection });
  elements.projection.textContent = state.projection === "globe" ? "Globe" : "2D";
  elements.projection.setAttribute("aria-pressed", String(state.projection === "globe"));
}

function switchBasemap(value) {
  pauseTour();
  state.basemap = value;
  popup.remove();
  map.setStyle(value === "gsi" ? GSI_STYLE : OPENFREEMAP_STYLE);
}

function bindMapInteractions() {
  map.on("click", "clusters", async (event) => {
    pauseTour();
    const feature = map.queryRenderedFeatures(event.point, { layers: ["clusters"] })[0];
    if (!feature) return;
    const source = map.getSource("fieldwork");
    const zoom = await source.getClusterExpansionZoom(feature.properties.cluster_id);
    map.easeTo({ center: feature.geometry.coordinates, zoom });
  });

  map.on("click", "unclustered-point", (event) => {
    pauseTour();
    const renderedFeature = event.features?.[0];
    if (!renderedFeature) return;
    const featureId = renderedFeature.properties.feature_id;
    const sourceFeature = state.data.features.find(
      (feature) => feature.properties.feature_id === featureId,
    );
    if (sourceFeature) {
      state.tourIndex = state.filteredData.features.findIndex(
        (feature) => feature.properties.feature_id === featureId,
      );
      openFeature(sourceFeature, { fly: false });
      setActiveResult(featureId);
      updateTourControls();
    }
  });

  ["clusters", "unclustered-point"].forEach((layerId) => {
    map.on("mouseenter", layerId, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", layerId, () => {
      map.getCanvas().style.cursor = "";
    });
  });
}

function bindControls() {
  const filterInputs = [
    elements.search,
    elements.municipality,
    elements.measuredOnly,
    elements.cfgOnly,
    ...elements.classInputs,
  ];
  filterInputs.forEach((input) => {
    input.addEventListener(input === elements.search ? "input" : "change", filterData);
  });
  elements.reset.addEventListener("click", resetFilters);
  elements.tourPlay.addEventListener("click", startTour);
  elements.tourPause.addEventListener("click", () => pauseTour({ revealPopup: true }));
  elements.fit.addEventListener("click", () => fitToFeatures());
  elements.basemap.addEventListener("change", (event) => switchBasemap(event.target.value));
  elements.projection.addEventListener("click", () => {
    state.projection = state.projection === "globe" ? "mercator" : "globe";
    setProjection();
  });
  elements.sidebarToggle.addEventListener("click", () => {
    if (elements.sidebar.classList.contains("is-open")) closeSidebar();
    else openSidebar();
  });
  elements.sidebarScrim.addEventListener("click", closeSidebar);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSidebar();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.tourPlaying) pauseTour();
  });
}

async function loadData() {
  const response = await fetch(DATA_URL);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (data.type !== "FeatureCollection" || !Array.isArray(data.features)) {
    throw new Error("GeoJSON FeatureCollection is required.");
  }
  return data;
}

function openHashFeature() {
  const featureId = decodeURIComponent(location.hash.replace(/^#/, ""));
  if (!featureId || !state.data) return;
  const feature = state.data.features.find(
    (item) => item.properties.feature_id === featureId,
  );
  if (feature) window.setTimeout(() => openFeature(feature), 300);
}

async function initialize() {
  bindControls();

  map.on("style.load", () => {
    setProjection();
    addDataLayers();
  });

  try {
    const [data] = await Promise.all([
      loadData(),
      new Promise((resolve) => {
        if (map.loaded()) resolve();
        else map.once("load", resolve);
      }),
    ]);
    state.data = data;
    state.filteredData = data;
    addDataLayers();
    updateSummary(data.features);
    renderResults(data.features);
    fitToFeatures(data.features);
    elements.loading.hidden = true;
    openHashFeature();
  } catch (error) {
    console.error(error);
    elements.loading.hidden = true;
    elements.error.hidden = false;
  }
}

initialize();
