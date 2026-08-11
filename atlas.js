(() => {
  "use strict";

  const CATEGORIES = {
    AI: "人工智能", DB: "数据库与数据挖掘", SC: "网络与信息安全", SE: "软件工程与系统软件",
    CG: "图形学与多媒体", HI: "人机交互", NW: "计算机网络", DS: "体系结构与分布式系统",
    CT: "计算机科学理论", MX: "交叉与新兴领域",
  };
  const CONTINENTS = { AF: "非洲", AS: "亚洲", EU: "欧洲", NA: "北美洲", SA: "南美洲", OC: "大洋洲" };
  const CONTINENT_COUNTRIES = {
    AF: "DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW",
    AS: "AF AM AZ BH BD BT BN KH CN CY GE IN ID IR IQ IL JP JO KZ KP KR KW KG LA LB MY MV MN MM NP OM PK PS PH QA SA SG LK SY TJ TH TL TR TM AE UZ VN YE HK MO",
    EU: "AL AD AT BY BE BA BG HR CZ DK EE FI FR DE GR HU IS IE IT XK LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH UA GB VA",
    NA: "AG BS BB BZ CA CR CU DM DO SV GD GT HT HN JM MX NI PA KN LC VC TT US GL BM PR",
    SA: "AR BO BR CL CO EC GY PY PE SR UY VE GF",
    OC: "AU FJ KI MH FM NR NZ PW PG WS SB TO TV VU NC PF",
  };
  const COUNTRY_TO_CONTINENT = new Map();
  Object.entries(CONTINENT_COUNTRIES).forEach(([continent, codes]) => codes.split(" ").forEach((code) => COUNTRY_TO_CONTINENT.set(code, continent)));

  const FALLBACK_LAND = {
    type: "FeatureCollection",
    features: [
      [[-168,72],[-145,70],[-125,55],[-110,49],[-96,50],[-82,45],[-60,48],[-52,25],[-82,9],[-105,20],[-118,32],[-132,49],[-168,60],[-168,72]],
      [[-82,12],[-68,10],[-50,-2],[-35,-12],[-50,-36],[-65,-55],[-76,-37],[-82,-5],[-82,12]],
      [[-18,36],[0,45],[28,40],[40,20],[51,10],[42,-12],[31,-34],[17,-35],[5,-25],[-10,2],[-18,36]],
      [[-10,72],[18,70],[40,58],[68,55],[95,72],[135,55],[168,64],[180,48],[145,38],[120,20],[100,7],[78,8],[58,25],[40,38],[20,35],[5,48],[-10,55],[-10,72]],
      [[112,-10],[135,-11],[154,-28],[147,-43],[120,-35],[112,-10]],
      [[-73,83],[-20,83],[-12,66],[-45,58],[-62,64],[-73,83]],
    ].map((coordinates) => ({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coordinates] } })),
  };

  const byId = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  const geojson = window.CCF_CONFERENCE_GEOJSON || JSON.parse(byId("conference-data").textContent);

  function normalizeConferenceCountry(conference) {
    if (conference.country_code !== "TW" && conference.country !== "Taiwan") return conference;
    const originalPlace = String(conference.place || "").trim();
    const place = /^taiwan$/i.test(originalPlace)
      ? "Taiwan, China"
      : originalPlace.replace(/,\s*Taiwan\b/gi, ", China");
    return { ...conference, country: "China", country_code: "CN", continent: "AS", place };
  }

  function normalizeCountryGeoJson(source) {
    if (!Array.isArray(source?.features)) return FALLBACK_LAND;
    const features = source.features.map((feature) => ({
      ...feature,
      properties: { ...feature.properties },
      geometry: { ...feature.geometry },
    }));
    const china = features.find((feature) => feature.properties.code === "CN");
    const taiwan = features.find((feature) => feature.properties.code === "TW");
    if (!china || !taiwan) return { ...source, features };

    const chinaPolygons = china.geometry.type === "MultiPolygon" ? china.geometry.coordinates : [china.geometry.coordinates];
    const taiwanPolygons = taiwan.geometry.type === "MultiPolygon" ? taiwan.geometry.coordinates : [taiwan.geometry.coordinates];
    china.geometry = { type: "MultiPolygon", coordinates: [...chinaPolygons, ...taiwanPolygons] };
    china.properties = { ...china.properties, name: "中华人民共和国", name_en: "China", code: "CN" };
    return { ...source, features: features.filter((feature) => feature !== taiwan) };
  }

  const conferences = geojson.features.map((feature) => normalizeConferenceCountry({ ...feature.properties, coordinates: feature.geometry.coordinates }));
  const countryGeoJson = normalizeCountryGeoJson(window.CCF_COUNTRY_GEOJSON || FALLBACK_LAND);
  const continentOf = (conference) => conference.continent || COUNTRY_TO_CONTINENT.get(conference.country_code) || "";

  const MONTH_INDEX = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  function conferenceMonth(conference) {
    const namedMonth = String(conference.date || "").match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b/i);
    const numericMonth = String(conference.date || "").match(/(?:^|\D)(\d{1,2})[/-]\d{1,2}(?:\D|$)/);
    const month = namedMonth ? MONTH_INDEX[namedMonth[1].slice(0, 3).toLowerCase()] : Math.min(12, Math.max(1, Number(numericMonth?.[1]) || 1));
    return `${conference.year}-${String(month).padStart(2, "0")}`;
  }

  conferences.forEach((conference) => {
    conference.month = conferenceMonth(conference);
    conference.continent = continentOf(conference);
  });

  const availableMonths = [...new Set(conferences.map((conference) => conference.month))].sort();
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthBounds = {
    from: availableMonths[0] || currentMonth,
    to: availableMonths.at(-1) > currentMonth ? availableMonths.at(-1) : currentMonth,
  };
  const initialRange = { from: currentMonth, to: monthBounds.to };
  const state = { category: "ALL", continent: "ALL", country: "ALL", ...initialRange };
  let map;
  let markers = [];

  function initHeroNetwork() {
    const canvas = byId("network-canvas");
    const context = canvas.getContext("2d");
    const locations = new Map();
    conferences.forEach((conference) => {
      const key = conference.coordinates.join(",");
      const node = locations.get(key) || { coordinates: conference.coordinates, count: 0 };
      node.count += 1;
      locations.set(key, node);
    });
    const nodes = [...locations.values()].sort((a, b) => b.count - a.count).slice(0, 130);
    const edges = [];
    nodes.forEach((node, index) => {
      const nearest = nodes
        .map((other, otherIndex) => ({ otherIndex, distance: otherIndex === index ? Infinity : Math.hypot(node.coordinates[0] - other.coordinates[0], (node.coordinates[1] - other.coordinates[1]) * 1.6) }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, index % 4 === 0 ? 3 : 2);
      nearest.forEach(({ otherIndex }) => {
        const pair = [index, otherIndex].sort((a, b) => a - b);
        if (!edges.some((edge) => edge[0] === pair[0] && edge[1] === pair[1])) edges.push(pair);
      });
    });

    let width = 0;
    let height = 0;
    let ratio = 1;
    function resize() {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    function project(coordinates) {
      return [width * (.08 + ((coordinates[0] + 180) / 360) * .84), height * (.13 + ((90 - coordinates[1]) / 180) * .72)];
    }
    function draw(time = 0) {
      context.clearRect(0, 0, width, height);
      const projected = nodes.map((node) => project(node.coordinates));
      context.lineWidth = .65;
      edges.forEach(([fromIndex, toIndex], edgeIndex) => {
        const from = projected[fromIndex];
        const to = projected[toIndex];
        const bend = Math.min(70, Math.hypot(to[0] - from[0], to[1] - from[1]) * .16);
        const middleX = (from[0] + to[0]) / 2;
        const middleY = (from[1] + to[1]) / 2 - bend;
        context.beginPath();
        context.moveTo(from[0], from[1]);
        context.quadraticCurveTo(middleX, middleY, to[0], to[1]);
        context.strokeStyle = "rgba(111, 199, 165, .18)";
        context.stroke();

        if (edgeIndex % 3 === 0) {
          const progress = ((time * .000045) + edgeIndex * .071) % 1;
          const inverse = 1 - progress;
          const x = inverse * inverse * from[0] + 2 * inverse * progress * middleX + progress * progress * to[0];
          const y = inverse * inverse * from[1] + 2 * inverse * progress * middleY + progress * progress * to[1];
          context.beginPath();
          context.arc(x, y, 1.5, 0, Math.PI * 2);
          context.fillStyle = "rgba(224, 197, 132, .9)";
          context.fill();
        }
      });
      nodes.forEach((node, index) => {
        const [x, y] = projected[index];
        const radius = Math.min(3.8, 1.1 + Math.sqrt(node.count) * .22);
        context.beginPath();
        context.arc(x, y, radius * 3.2, 0, Math.PI * 2);
        context.fillStyle = "rgba(94, 190, 155, .055)";
        context.fill();
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fillStyle = index < 14 ? "rgba(231, 198, 126, .9)" : "rgba(126, 214, 180, .72)";
        context.fill();
      });
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) requestAnimationFrame(draw);
    }
    resize();
    window.addEventListener("resize", resize, { passive: true });
    requestAnimationFrame(draw);
  }

  function deadlineRows(conference) {
    const timeline = Array.isArray(conference.timeline) ? conference.timeline : [];
    return timeline.slice(0, 3).flatMap((item, index) => {
      const suffix = timeline.length > 1 ? ` ${index + 1}` : "";
      const timezone = item.timezone ? ` · ${escapeHtml(item.timezone)}` : "";
      return [
        item.abstract_deadline ? `<div><dt>摘要${suffix}</dt><dd>${escapeHtml(item.abstract_deadline)}${timezone}</dd></div>` : "",
        item.deadline ? `<div><dt>投稿${suffix}</dt><dd>${escapeHtml(item.deadline)}${timezone}</dd></div>` : "",
      ];
    }).join("");
  }

  function popupHtml(conference) {
    const rating = [conference.core_rank && conference.core_rank !== "N" && `CORE ${conference.core_rank}`, conference.thcpl_rank && conference.thcpl_rank !== "N" && `TH-CPL ${conference.thcpl_rank}`].filter(Boolean).join(" · ");
    const category = CATEGORIES[conference.category] || conference.category || "其他";
    return `<article class="conference-popup">
      <header><span class="popup-rank">CCF ${escapeHtml(conference.rank || "—")}</span><time>${escapeHtml(conference.year)}</time></header>
      <h2>${escapeHtml(conference.title)}</h2>
      <p>${escapeHtml(conference.description)}</p>
      <dl>
        <div><dt>领域</dt><dd>${escapeHtml(category)}</dd></div>
        ${rating ? `<div><dt>评级</dt><dd>${escapeHtml(rating)}</dd></div>` : ""}
        <div><dt>日期</dt><dd>${escapeHtml(conference.date || "待公布")}</dd></div>
        <div><dt>地点</dt><dd>${escapeHtml(conference.place)}</dd></div>
        ${deadlineRows(conference)}
      </dl>
      <a href="${escapeHtml(conference.link || conference.source)}" target="_blank" rel="noreferrer">会议网站 <span>↗</span></a>
    </article>`;
  }

  function latestVisibleConferences() {
    const filtered = conferences.filter((conference) => {
      if (conference.month < state.from || conference.month > state.to) return false;
      if (state.category !== "ALL" && conference.category !== state.category) return false;
      if (state.continent !== "ALL" && conference.continent !== state.continent) return false;
      if (state.country !== "ALL" && conference.country_code !== state.country) return false;
      return true;
    });
    const latest = new Map();
    filtered.forEach((conference) => {
      const current = latest.get(conference.title);
      if (!current || conference.month > current.month) latest.set(conference.title, conference);
    });
    return [...latest.values()].sort((a, b) => a.title.localeCompare(b.title));
  }

  function clearMarkers() {
    markers.forEach((marker) => marker.remove());
    markers = [];
  }

  function renderMarkers() {
    if (!map) return;
    clearMarkers();
    const visible = latestVisibleConferences();
    const coordinateSlots = new Map();
    visible.forEach((conference) => {
      const key = conference.coordinates.join(",");
      const slot = coordinateSlots.get(key) || 0;
      coordinateSlots.set(key, slot + 1);
      const ring = Math.floor(slot / 8);
      const angle = (slot % 8) * (Math.PI / 4) - Math.PI / 2;
      const radius = slot === 0 ? 0 : 22 + ring * 22;
      const offsetX = Math.cos(angle) * radius;
      const offsetY = Math.sin(angle) * radius;

      const element = document.createElement("button");
      element.type = "button";
      element.className = "conference-marker";
      element.dataset.rank = String(conference.rank || "").toLowerCase();
      element.setAttribute("aria-label", `${conference.title}，${conference.place}`);
      const colors = { A: "#9f4029", B: "#4a6c5e", C: "#8a7448" };
      element.innerHTML = `<span class="marker-badge" style="--marker-x:${offsetX.toFixed(1)}px;--marker-y:${offsetY.toFixed(1)}px;--marker-delay:${((slot % 7) * -.34).toFixed(2)}s;--marker-color:${colors[conference.rank] || "#665c44"}"><i class="marker-pin"></i><b class="marker-name">${escapeHtml(conference.title)}</b></span>`;

      const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: "360px", offset: 24 }).setHTML(popupHtml(conference));
      const marker = new maplibregl.Marker({ element, anchor: "center" }).setLngLat(conference.coordinates).setPopup(popup).addTo(map);
      markers.push(marker);
    });
    byId("result-count").value = `${visible.length} 个会议`;
    byId("result-count").textContent = `${visible.length} 个会议`;
  }

  function countryOptions() {
    const countries = new Map();
    conferences.forEach((conference) => {
      if (state.continent === "ALL" || conference.continent === state.continent) countries.set(conference.country_code, conference.country);
    });
    return [...countries.entries()].sort((a, b) => a[1].localeCompare(b[1], "zh-CN"));
  }

  function refreshCountrySelect() {
    const select = byId("country-filter");
    const options = countryOptions();
    if (state.country !== "ALL" && !options.some(([code]) => code === state.country)) state.country = "ALL";
    select.innerHTML = `<option value="ALL">全部国家 / 地区</option>${options.map(([code, name]) => `<option value="${escapeHtml(code)}">${escapeHtml(name)}</option>`).join("")}`;
    select.value = state.country;
  }

  function bindFilters() {
    const category = byId("category-filter");
    const continent = byId("continent-filter");
    const from = byId("from-month");
    const to = byId("to-month");
    category.innerHTML = `<option value="ALL">全部类型</option>${Object.entries(CATEGORIES).map(([code, name]) => `<option value="${code}">${escapeHtml(name)}</option>`).join("")}`;
    continent.innerHTML = `<option value="ALL">全部大洲</option>${Object.entries(CONTINENTS).map(([code, name]) => `<option value="${code}">${name}</option>`).join("")}`;
    from.min = to.min = monthBounds.from;
    from.max = to.max = monthBounds.to;
    from.value = state.from;
    to.value = state.to;
    refreshCountrySelect();

    category.addEventListener("change", () => { state.category = category.value; renderMarkers(); });
    continent.addEventListener("change", () => { state.continent = continent.value; refreshCountrySelect(); renderMarkers(); });
    byId("country-filter").addEventListener("change", (event) => { state.country = event.target.value; renderMarkers(); });
    from.addEventListener("change", () => { state.from = from.value || initialRange.from; if (state.from > state.to) { state.to = state.from; to.value = state.to; } renderMarkers(); });
    to.addEventListener("change", () => { state.to = to.value || initialRange.to; if (state.to < state.from) { state.from = state.to; from.value = state.from; } renderMarkers(); });
    byId("reset-filter").addEventListener("click", () => {
      Object.assign(state, { category: "ALL", continent: "ALL", country: "ALL", ...initialRange });
      category.value = "ALL";
      continent.value = "ALL";
      from.value = state.from;
      to.value = state.to;
      refreshCountrySelect();
      renderMarkers();
      map.flyTo({ center: [15, 20], zoom: .65, bearing: 0, pitch: 0, duration: 1000, essential: true });
    });
    byId("filter-bar").addEventListener("submit", (event) => event.preventDefault());
    byId("filter-toggle").addEventListener("click", () => {
      const hidden = byId("atlas").classList.toggle("filters-hidden");
      byId("filter-toggle").setAttribute("aria-expanded", String(!hidden));
    });
  }

  function initMap() {
    if (!window.maplibregl) {
      byId("map-status").textContent = "当前浏览器无法启动 3D 地图，请使用最新版 Chrome、Edge 或 Firefox";
      return;
    }
    if (window.__MAPLIBRE_WORKER_SOURCE__) {
      const workerBlobUrl = URL.createObjectURL(new Blob([window.__MAPLIBRE_WORKER_SOURCE__], { type: "text/javascript" }));
      maplibregl.setWorkerUrl(workerBlobUrl);
      maplibregl.setWorkerCount(1);
      window.addEventListener("unload", () => URL.revokeObjectURL(workerBlobUrl), { once: true });
    }
    map = new maplibregl.Map({
      container: "map",
      center: [15, 20],
      zoom: .65,
      minZoom: 0,
      maxZoom: 12,
      attributionControl: false,
      canvasContextAttributes: { antialias: true },
      style: {
        version: 8,
        projection: { type: "globe" },
        sources: {
          "fallback-land": { type: "geojson", data: FALLBACK_LAND },
          countries: { type: "geojson", data: countryGeoJson },
          basemap: { type: "raster", tiles: ["https://a.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}@2x.png"], tileSize: 256, attribution: "© OpenStreetMap contributors © CARTO" },
          labels: { type: "raster", tiles: ["https://a.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}@2x.png"], tileSize: 256 },
        },
        layers: [
          { id: "paper", type: "background", paint: { "background-color": "#bda777" } },
          { id: "fallback-land", type: "fill", source: "fallback-land", paint: { "fill-color": "#d5c395", "fill-outline-color": "#806b48" } },
          { id: "basemap", type: "raster", source: "basemap", paint: { "raster-opacity": .98, "raster-saturation": -.08, "raster-contrast": .1, "raster-brightness-min": .08, "raster-brightness-max": .97 } },
          { id: "country-colors", type: "fill", source: "countries", paint: { "fill-color": ["match", ["get", "color"], 1, "#d8aa72", 2, "#8eb6a0", 3, "#d5c46d", 4, "#89abc1", 5, "#c99389", 6, "#a399bb", 7, "#b6a987", "#c9b98e"], "fill-opacity": .58 } },
          { id: "country-borders", type: "line", source: "countries", paint: { "line-color": "#574a38", "line-opacity": .82, "line-width": ["interpolate", ["linear"], ["zoom"], 0, .5, 4, 1.1, 8, 1.7] } },
          { id: "labels", type: "raster", source: "labels", paint: { "raster-opacity": .96, "raster-contrast": .12 } },
        ],
      },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: false }), "bottom-right");
    if (maplibregl.FullscreenControl) map.addControl(new maplibregl.FullscreenControl(), "bottom-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
    map.on("style.load", () => map.setProjection({ type: "globe" }));
    map.on("load", () => {
      byId("map-status")?.remove();
      renderMarkers();
    });
    map.on("error", () => {
      const status = byId("map-status");
      if (status) status.textContent = "在线底图不可用，正在显示本地地理轮廓…";
    });
  }

  window.addEventListener("DOMContentLoaded", () => {
    initHeroNetwork();
    bindFilters();
    initMap();
  });
})();
