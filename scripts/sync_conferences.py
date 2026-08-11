#!/usr/bin/env python3
"""Convert ccfddl/ccf-deadlines YAML files into browser-ready GeoJSON."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import unicodedata
from pathlib import Path
from typing import Any

import geonamescache
import yaml


SOURCE_BASE = "https://github.com/ccfddl/ccf-deadlines/blob/main/conference"
VIRTUAL_ONLY = {
    "online",
    "tbd",
    "to be announced",
    "to be determined",
    "virtual",
    "virtual event",
    "virtual conference",
}


def normalized(value: Any) -> str:
    value = unicodedata.normalize("NFKD", str(value or ""))
    value = "".join(char for char in value if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", " ", value.casefold()).strip()


def text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (dt.date, dt.datetime)):
        return value.isoformat(sep=" ")
    return str(value)


def timeline_items(value: Any) -> list[dict[str, str]]:
    rows = value if isinstance(value, list) else [value]
    return [
        {str(key): text(item).strip() for key, item in row.items() if item is not None}
        for row in rows
        if isinstance(row, dict)
    ]


def normalize_country(location: dict[str, Any]) -> dict[str, Any]:
    """Keep Taiwan locations under China in generated filters and labels."""
    normalized_location = dict(location)
    if normalized_location.get("country_code") == "TW":
        normalized_location.update(country="China", country_code="CN", continent="AS")
    return normalized_location


class LocationResolver:
    def __init__(self, overrides_path: Path):
        self.overrides: dict[str, Any] = {}
        if overrides_path.exists():
            raw = json.loads(overrides_path.read_text(encoding="utf-8"))
            self.overrides = {normalized(key): value for key, value in raw.items()}

        cache = geonamescache.GeonamesCache()
        self.countries = cache.get_countries()
        self.country_hints: dict[str, str] = {}
        for code, country in self.countries.items():
            name = normalized(country.get("name"))
            if name:
                self.country_hints[name] = code
        self.country_hints.update(
            {
                "usa": "US",
                "u s a": "US",
                "united states of america": "US",
                "uk": "GB",
                "u k": "GB",
                "south korea": "KR",
                "republic of korea": "KR",
            }
        )

        self.cities_by_alias: dict[str, list[dict[str, Any]]] = {}
        for city in cache.get_cities().values():
            aliases = {city.get("name", "")}
            aliases.update(city.get("alternatenames") or [])
            for alias in aliases:
                key = normalized(alias)
                if len(key) >= 3:
                    self.cities_by_alias.setdefault(key, []).append(city)

    def resolve(self, place: str) -> dict[str, Any] | None:
        key = normalized(place)
        if not key or key in VIRTUAL_ONLY:
            return None
        if key in self.overrides:
            location = dict(self.overrides[key])
            location["continent"] = self.countries.get(location.get("country_code", ""), {}).get("continentcode", "")
            return normalize_country(location)

        country_codes = {
            code for hint, code in self.country_hints.items() if re.search(rf"\b{re.escape(hint)}\b", key)
        }
        phrases: set[str] = set()
        for part in re.split(r"[,;/|()]", place):
            words = normalized(part).split()
            for size in range(min(5, len(words)), 0, -1):
                for start in range(0, len(words) - size + 1):
                    phrases.add(" ".join(words[start : start + size]))

        candidates: list[tuple[int, int, dict[str, Any]]] = []
        for phrase in phrases:
            for city in self.cities_by_alias.get(phrase, []):
                country_match = int(not country_codes or city.get("countrycode") in country_codes)
                candidates.append((country_match, int(city.get("population") or 0), city))
        if not candidates:
            return None

        _, _, city = max(candidates, key=lambda item: (item[0], item[1]))
        country_code = city.get("countrycode", "")
        country = self.countries.get(country_code, {}).get("name", country_code)
        return normalize_country({
            "city": city.get("name", place.split(",", 1)[0]),
            "country": country,
            "country_code": country_code,
            "continent": self.countries.get(country_code, {}).get("continentcode", ""),
            "longitude": float(city["longitude"]),
            "latitude": float(city["latitude"]),
        })


def conference_rows(source: Path, resolver: LocationResolver) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    features: list[dict[str, Any]] = []
    definitions = 0
    editions = 0
    unresolved: set[str] = set()

    for yaml_path in sorted(source.glob("*/*.yml")):
        payload = yaml.safe_load(yaml_path.read_text(encoding="utf-8")) or []
        entries = payload if isinstance(payload, list) else [payload]
        for conference in entries:
            if not isinstance(conference, dict):
                continue
            definitions += 1
            rank = conference.get("rank") if isinstance(conference.get("rank"), dict) else {}
            for edition in conference.get("confs") or []:
                if not isinstance(edition, dict):
                    continue
                try:
                    year = int(edition.get("year"))
                except (TypeError, ValueError):
                    continue
                editions += 1
                place = text(edition.get("place")).strip()
                location = resolver.resolve(place)
                if not location:
                    unresolved.add(place or "(empty)")
                    continue

                relative = yaml_path.relative_to(source).as_posix()
                source_url = f"{SOURCE_BASE}/{relative}"
                link = text(edition.get("link")).strip()
                if not link.startswith(("https://", "http://")):
                    link = source_url
                features.append(
                    {
                        "type": "Feature",
                        "geometry": {
                            "type": "Point",
                            "coordinates": [location["longitude"], location["latitude"]],
                        },
                        "properties": {
                            "id": text(edition.get("id") or f"{conference.get('title', 'conference')}-{year}"),
                            "title": text(conference.get("title")).strip(),
                            "description": text(conference.get("description")).strip(),
                            "category": text(conference.get("sub")).strip().upper(),
                            "rank": text(rank.get("ccf") or "-").strip().upper(),
                            "core_rank": text(rank.get("core")).strip(),
                            "thcpl_rank": text(rank.get("thcpl")).strip(),
                            "dblp": text(conference.get("dblp")).strip(),
                            "year": year,
                            "date": text(edition.get("date")).strip(),
                            "place": place,
                            "city": location["city"],
                            "country": location["country"],
                            "country_code": location["country_code"],
                            "continent": location["continent"],
                            "link": link,
                            "timeline": timeline_items(edition.get("timeline")),
                            "source": source_url,
                        },
                    }
                )

    features.sort(key=lambda feature: (-feature["properties"]["year"], feature["properties"]["title"]))
    metadata = {
        "generated_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "source": "ccfddl/ccf-deadlines",
        "conference_count": definitions,
        "edition_count": editions,
        "mapped_edition_count": len(features),
        "unmapped_edition_count": editions - len(features),
        "location_count": len({tuple(feature["geometry"]["coordinates"]) for feature in features}),
        "unresolved_places": sorted(unresolved),
    }
    return features, metadata


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("conference-data.js"))
    parser.add_argument("--overrides", type=Path, default=Path("data/location-overrides.json"))
    parser.add_argument("--report", type=Path, default=Path("data/sync-report.json"))
    args = parser.parse_args()

    if not args.source.is_dir():
        raise SystemExit(f"Conference directory not found: {args.source}")

    features, metadata = conference_rows(args.source, LocationResolver(args.overrides))
    geojson = {"type": "FeatureCollection", "metadata": metadata, "features": features}
    encoded = json.dumps(geojson, ensure_ascii=False, separators=(",", ":"))
    encoded = encoded.replace("</", "<\\/").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")

    args.output.write_text(f"window.CCF_CONFERENCE_GEOJSON={encoded};\n", encoding="utf-8")
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"Generated {len(features)} mapped editions from {metadata['conference_count']} conferences; "
        f"{metadata['unmapped_edition_count']} editions remain unmapped."
    )


if __name__ == "__main__":
    main()
