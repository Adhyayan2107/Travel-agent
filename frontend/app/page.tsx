"use client";

import { useState, useId } from "react";
import { useRouter } from "next/navigation";
import {
  Plane,
  Sparkles,
  Globe2,
  Map,
  Star,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { submitBrief } from "@/lib/api";

const INTERESTS = [
  { id: "food", label: "Food & Cuisine" },
  { id: "history", label: "History & Culture" },
  { id: "nature", label: "Nature & Outdoors" },
  { id: "adventure", label: "Adventure Sports" },
  { id: "shopping", label: "Shopping" },
  { id: "art", label: "Art & Museums" },
];

const ACCOMMODATION_PREFS = [
  { id: "pool", label: "Swimming Pool" },
  { id: "city-center", label: "City Center" },
  { id: "beach", label: "Beach Access" },
  { id: "budget", label: "Budget Friendly" },
  { id: "luxury", label: "Luxury" },
];

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED"];

function CheckboxGroup({
  options,
  selected,
  onChange,
}: {
  options: { id: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (id: string) => {
    onChange(
      selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
    );
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const checked = selected.includes(opt.id);
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => toggle(opt.id)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 border ${
              checked
                ? "bg-indigo-600 border-indigo-600 text-white shadow-md"
                : "bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const uid = useId();

  const [tab, setTab] = useState<"quick" | "detailed">("quick");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quick brief
  const [quickText, setQuickText] = useState("");

  // Detailed form
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [departureDate, setDepartureDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [travellers, setTravellers] = useState(2);
  const [budgetMin, setBudgetMin] = useState(100000);
  const [budgetMax, setBudgetMax] = useState(200000);
  const [currency, setCurrency] = useState("INR");
  const [interests, setInterests] = useState<string[]>([]);
  const [accommodationPrefs, setAccommodationPrefs] = useState<string[]>([]);
  const [specialRequirements, setSpecialRequirements] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      let briefText = "";

      if (tab === "quick") {
        if (!quickText.trim()) {
          setError("Please describe your trip.");
          setLoading(false);
          return;
        }
        briefText = quickText.trim();
      } else {
        if (!origin || !destination || !departureDate) {
          setError("Please fill in origin, destination, and departure date.");
          setLoading(false);
          return;
        }
        const parts = [
          `I want to travel from ${origin} to ${destination}.`,
          `Departure: ${departureDate}.`,
          returnDate ? `Return: ${returnDate}.` : "",
          `Travellers: ${travellers}.`,
          `Budget: ${currency} ${budgetMin.toLocaleString()} to ${budgetMax.toLocaleString()}.`,
          interests.length > 0 ? `Interests: ${interests.join(", ")}.` : "",
          accommodationPrefs.length > 0
            ? `Accommodation preferences: ${accommodationPrefs.join(", ")}.`
            : "",
          specialRequirements ? `Special requirements: ${specialRequirements}.` : "",
        ]
          .filter(Boolean)
          .join(" ");
        briefText = parts;
      }

      const userId = `user_${uid.replace(/:/g, "")}`;
      const { sessionId, tripId } = await submitBrief(userId, briefText);
      router.push(`/trip/${tripId}?session=${sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen relative overflow-hidden">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700" />

      {/* Animated blobs */}
      <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-blue-400 opacity-20 blur-3xl animate-pulse" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-violet-400 opacity-20 blur-3xl animate-pulse delay-1000" />

      {/* Floating icons */}
      <div className="absolute top-8 left-8 text-white/20 pointer-events-none hidden lg:block">
        <Globe2 size={48} />
      </div>
      <div className="absolute top-16 right-24 text-white/15 pointer-events-none hidden lg:block">
        <Star size={32} />
      </div>
      <div className="absolute bottom-24 right-12 text-white/15 pointer-events-none hidden lg:block">
        <Map size={40} />
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-3">
              <Plane className="text-white" size={28} />
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white mb-4 tracking-tight">
            Plan Your Perfect Trip
          </h1>
          <p className="text-blue-100 text-lg md:text-xl max-w-xl mx-auto font-light">
            Describe your dream journey. Our AI handles the rest.
          </p>
          <div className="flex items-center justify-center gap-2 mt-3">
            <Sparkles className="text-yellow-300" size={16} />
            <span className="text-yellow-200 text-sm font-medium">
              Powered by AI — flights, hotels &amp; activities in seconds
            </span>
            <Sparkles className="text-yellow-300" size={16} />
          </div>
        </div>

        {/* Form card */}
        <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-slate-100">
            <button
              type="button"
              onClick={() => setTab("quick")}
              className={`flex-1 py-4 text-sm font-semibold transition-all duration-200 ${
                tab === "quick"
                  ? "text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Quick Brief
            </button>
            <button
              type="button"
              onClick={() => setTab("detailed")}
              className={`flex-1 py-4 text-sm font-semibold transition-all duration-200 ${
                tab === "detailed"
                  ? "text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Detailed Form
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-6">
            {tab === "quick" ? (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Describe your trip
                </label>
                <textarea
                  value={quickText}
                  onChange={(e) => setQuickText(e.target.value)}
                  rows={6}
                  placeholder="I want to fly from Mumbai to Paris for 5 days in August 2026, 2 adults, budget between ₹1.5L to ₹2L. Interested in art, food, and history. Prefer 4-star hotels near city centre."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 placeholder-slate-400 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 leading-relaxed"
                />
                <p className="text-xs text-slate-400 mt-2">
                  Be as detailed as you like — dates, budget, preferences, special needs.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                      Origin City
                    </label>
                    <input
                      type="text"
                      value={origin}
                      onChange={(e) => setOrigin(e.target.value)}
                      placeholder="Mumbai"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                      Destination
                    </label>
                    <input
                      type="text"
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      placeholder="Paris"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                      Departure Date
                    </label>
                    <input
                      type="date"
                      value={departureDate}
                      onChange={(e) => setDepartureDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                      Return Date{" "}
                      <span className="font-normal text-slate-400">(optional)</span>
                    </label>
                    <input
                      type="date"
                      value={returnDate}
                      onChange={(e) => setReturnDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Number of Travellers
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setTravellers(Math.max(1, travellers - 1))}
                      className="w-9 h-9 rounded-full bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 font-bold flex items-center justify-center transition"
                    >
                      −
                    </button>
                    <span className="text-xl font-bold text-slate-800 w-8 text-center">
                      {travellers}
                    </span>
                    <button
                      type="button"
                      onClick={() => setTravellers(travellers + 1)}
                      className="w-9 h-9 rounded-full bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 font-bold flex items-center justify-center transition"
                    >
                      +
                    </button>
                    <span className="text-sm text-slate-400 ml-1">
                      {travellers === 1 ? "adult" : "adults"}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Budget Range
                  </label>
                  <div className="flex items-center gap-2">
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={budgetMin}
                      onChange={(e) => setBudgetMin(Number(e.target.value))}
                      placeholder="Min"
                      className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                    />
                    <span className="text-slate-400 font-medium">to</span>
                    <input
                      type="number"
                      value={budgetMax}
                      onChange={(e) => setBudgetMax(Number(e.target.value))}
                      placeholder="Max"
                      className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Interests
                  </label>
                  <CheckboxGroup
                    options={INTERESTS}
                    selected={interests}
                    onChange={setInterests}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Accommodation Preferences
                  </label>
                  <CheckboxGroup
                    options={ACCOMMODATION_PREFS}
                    selected={accommodationPrefs}
                    onChange={setAccommodationPrefs}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Special Requirements{" "}
                    <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={specialRequirements}
                    onChange={(e) => setSpecialRequirements(e.target.value)}
                    placeholder="e.g. vegetarian meals, wheelchair accessible, honeymoon..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm font-medium">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-70 disabled:cursor-not-allowed text-base"
            >
              {loading ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Planning your trip...
                </>
              ) : (
                <>
                  <Sparkles size={20} />
                  Plan My Trip
                  <ChevronRight size={18} />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer badges */}
        <div className="flex flex-wrap gap-4 mt-8 justify-center">
          {["AI-Powered Search", "Real-time Booking", "Conflict Detection", "Instant Itinerary"].map(
            (label) => (
              <div
                key={label}
                className="bg-white/15 backdrop-blur-sm rounded-full px-4 py-1.5 text-white/90 text-xs font-medium border border-white/20"
              >
                {label}
              </div>
            )
          )}
        </div>
      </div>
    </main>
  );
}
