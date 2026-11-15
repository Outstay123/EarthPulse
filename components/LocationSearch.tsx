"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoSearchResult } from "@/types/weather";

interface LocationSearchProps {
  onSelect: (result: GeoSearchResult) => void;
  isLoading: boolean;
}

export default function LocationSearch({
  onSelect,
  isLoading,
}: LocationSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced autocomplete search.
  useEffect(() => {
    if (query.trim().length < 2) return;

    const controller = new AbortController();

    const timer = setTimeout(async () => {
      setIsSearching(true);
      setError(null);
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}`, {
          signal: controller.signal,
        });
        const json = (await res.json()) as {
          results?: GeoSearchResult[];
          error?: string;
        };
        if (json.error) {
          setError(json.error);
          setResults([]);
        } else {
          setResults(json.results ?? []);
          setIsOpen(true);
          setHighlighted(0);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError("Location search failed. Please try again.");
          setResults([]);
        }
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timer);
      setIsSearching(false);
    };
  }, [query]);

  // Close the dropdown on outside clicks.
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function select(result: GeoSearchResult) {
    setQuery(result.label);
    setIsOpen(false);
    onSelect(result);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (results.length > 0) {
      select(results[Math.min(highlighted, results.length - 1)]);
    } else if (query.trim().length >= 2) {
      setError("No matching location found. Try a different spelling.");
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((h) => Math.min(h + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (event.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <form onSubmit={handleSubmit}>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 fill-slate-400"
            >
              <path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setResults([]);
                setError(null);
                setIsOpen(false);
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => results.length > 0 && setIsOpen(true)}
              placeholder="Search a place on Earth… (e.g. Tokyo, London)"
              aria-label="Search for a location"
              className="h-12 w-full rounded-full border border-white/10 bg-slate-900/80 pl-11 pr-4 text-sm text-white placeholder:text-slate-500 shadow-lg focus:border-sky-400/50 focus:outline-none focus:ring-2 focus:ring-sky-400/30"
            />
            {isSearching && (
              <span className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-sky-400" />
            )}
          </div>
          <button
            type="submit"
            disabled={isLoading || query.trim().length < 2}
            className="inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-5 text-sm font-medium text-white shadow-lg shadow-emerald-500/25 transition-all hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Loading…" : "Search"}
          </button>
        </div>
      </form>

      {error && (
        <p
          role="alert"
          className="mt-2 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-2 text-xs text-rose-300"
        >
          {error}
        </p>
      )}

      {isOpen && results.length > 0 && (
        <ul
          role="listbox"
          aria-label="Location search results"
          className="absolute z-10 mt-2 w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-900/95 shadow-2xl backdrop-blur"
        >
          {results.map((result, index) => (
            <li key={result.id} role="option" aria-selected={index === highlighted}>
              <button
                type="button"
                onClick={() => select(result)}
                onMouseEnter={() => setHighlighted(index)}
                className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition-colors ${
                  index === highlighted
                    ? "bg-sky-500/20 text-white"
                    : "text-slate-300 hover:bg-white/5"
                }`}
              >
                <span>
                  <span className="font-medium">{result.name}</span>
                  {result.admin1 || result.country ? (
                    <span className="text-slate-400">
                      {" "}
                      · {[result.admin1, result.country]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  ) : null}
                </span>
                <span className="font-mono text-[10px] text-slate-500">
                  {result.lat.toFixed(2)}, {result.lon.toFixed(2)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
