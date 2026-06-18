"use client";

import type { Itinerary, Flight, Hotel } from "@/lib/types";
import {
  Plane,
  Building2,
  Users,
  IndianRupee,
  ArrowRight,
  Calendar,
  MapPin,
  Star,
  Clock,
  CheckCircle2,
} from "lucide-react";
import DayCard from "./DayCard";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatTime(timeStr: string): string {
  if (!timeStr) return "";
  if (timeStr.includes("T")) {
    return new Date(timeStr).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }
  return timeStr;
}

function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m > 0 ? m + "m" : ""}`.trim() : `${m}m`;
}

function FlightSummary({ flight, label }: { flight: Flight; label: string }) {
  const statusColors: Record<Flight["status"], string> = {
    scheduled: "bg-emerald-100 text-emerald-700",
    delayed: "bg-amber-100 text-amber-700",
    cancelled: "bg-red-100 text-red-700",
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="bg-blue-100 rounded-lg p-2">
          <Plane className="text-blue-600" size={16} />
        </div>
        <span className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
          {label}
        </span>
        <span
          className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[flight.status]}`}
        >
          {flight.status}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-center">
          <p className="text-2xl font-bold text-slate-900">{formatTime(flight.departTime)}</p>
          <p className="text-sm font-medium text-slate-600 mt-0.5">{flight.origin}</p>
        </div>

        <div className="flex-1 flex flex-col items-center px-4">
          <p className="text-xs text-slate-400 mb-1">
            {formatDuration(flight.durationMins)} ·{" "}
            {flight.stops === 0 ? "Nonstop" : `${flight.stops} stop${flight.stops > 1 ? "s" : ""}`}
          </p>
          <div className="w-full flex items-center gap-1">
            <div className="h-px flex-1 bg-slate-200" />
            <Plane size={14} className="text-blue-400" />
            <div className="h-px flex-1 bg-slate-200" />
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {flight.airline} · {flight.flightNumber}
          </p>
        </div>

        <div className="text-center">
          <p className="text-2xl font-bold text-slate-900">{formatTime(flight.arriveTime)}</p>
          <p className="text-sm font-medium text-slate-600 mt-0.5">{flight.destination}</p>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-sm">
        <span className="text-slate-400 font-mono text-xs">Ref: {flight.bookingRef}</span>
        {flight.totalPrice > 0 && (
          <span className="font-bold text-blue-600 flex items-center gap-0.5">
            <IndianRupee size={14} />
            {flight.totalPrice.toLocaleString("en-IN")}
          </span>
        )}
      </div>
    </div>
  );
}

function HotelSummary({ hotel }: { hotel: Hotel }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="bg-purple-100 rounded-lg p-2">
          <Building2 className="text-purple-600" size={16} />
        </div>
        <span className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
          Accommodation
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          {Array.from({ length: hotel.stars }).map((_, i) => (
            <Star key={i} size={12} className="text-yellow-400 fill-yellow-400" />
          ))}
        </div>
      </div>

      <p className="text-lg font-bold text-slate-800">{hotel.name}</p>
      <p className="flex items-center gap-1 text-sm text-slate-500 mt-1">
        <MapPin size={13} />
        {hotel.address}
      </p>

      <div className="grid grid-cols-2 gap-3 mt-3">
        <div className="bg-slate-50 rounded-xl p-3">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Check-in</p>
          <p className="font-semibold text-slate-700 text-sm mt-0.5">
            {formatDate(hotel.checkIn)}
          </p>
          <p className="text-xs text-slate-400">{hotel.checkInTime}</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Check-out</p>
          <p className="font-semibold text-slate-700 text-sm mt-0.5">
            {formatDate(hotel.checkOut)}
          </p>
          <p className="text-xs text-slate-400">{hotel.checkOutTime}</p>
        </div>
      </div>

      {hotel.amenities?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {hotel.amenities.map((a) => (
            <span
              key={a}
              className="bg-purple-50 text-purple-700 text-xs px-2.5 py-0.5 rounded-full border border-purple-100"
            >
              {a}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-sm">
        <span className="text-slate-400 font-mono text-xs">Ref: {hotel.bookingRef}</span>
        {hotel.totalPrice > 0 && (
          <span className="font-bold text-purple-600 flex items-center gap-0.5">
            <IndianRupee size={14} />
            {hotel.totalPrice.toLocaleString("en-IN")} total
          </span>
        )}
      </div>
    </div>
  );
}

interface ItineraryViewProps {
  itinerary: Itinerary;
}

export default function ItineraryView({ itinerary }: ItineraryViewProps) {
  const brief = itinerary.brief;
  const totalActivitiesCost = (itinerary.activities ?? []).reduce(
    (sum, a) => sum + (a.cost ?? 0),
    0
  );
  const flightsCost =
    (itinerary.outboundFlight?.totalPrice ?? 0) +
    (itinerary.returnFlight?.totalPrice ?? 0);
  const hotelCost = itinerary.hotel?.totalPrice ?? 0;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Hero header card */}
      <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-3xl p-6 md:p-8 text-white shadow-xl">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl font-bold">{brief?.origin ?? itinerary.outboundFlight?.origin ?? "—"}</span>
              <ArrowRight size={20} className="text-white/60" />
              <span className="text-2xl font-bold">{brief?.destination ?? itinerary.outboundFlight?.destination ?? "—"}</span>
            </div>
            <div className="flex flex-wrap gap-4 text-white/80 text-sm">
              {brief?.departureDate && (
                <span className="flex items-center gap-1.5">
                  <Calendar size={14} />
                  {formatDate(brief.departureDate)}
                  {brief.returnDate && ` – ${formatDate(brief.returnDate)}`}
                </span>
              )}
              {brief?.travellers && (
                <span className="flex items-center gap-1.5">
                  <Users size={14} />
                  {brief.travellers} {brief.travellers === 1 ? "traveller" : "travellers"}
                </span>
              )}
            </div>
          </div>

          <div className="text-right">
            <p className="text-white/60 text-xs font-medium uppercase tracking-wider mb-1">
              Total Cost
            </p>
            <p className="text-3xl font-extrabold">
              {formatCurrency(itinerary.totalCost)}
            </p>
            <div className="mt-1 flex items-center justify-end gap-1">
              <CheckCircle2 size={14} className="text-emerald-300" />
              <span className="text-emerald-200 text-xs font-medium capitalize">
                {itinerary.status ?? "planned"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Flights */}
      {(itinerary.outboundFlight || itinerary.returnFlight) && (
        <section>
          <h2 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
            <Plane size={18} className="text-blue-500" /> Flights
          </h2>
          <div className="space-y-3">
            {itinerary.outboundFlight && (
              <FlightSummary flight={itinerary.outboundFlight} label="Outbound Flight" />
            )}
            {itinerary.returnFlight && (
              <FlightSummary flight={itinerary.returnFlight} label="Return Flight" />
            )}
          </div>
        </section>
      )}

      {/* Hotel */}
      {itinerary.hotel && (
        <section>
          <h2 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
            <Building2 size={18} className="text-purple-500" /> Hotel
          </h2>
          <HotelSummary hotel={itinerary.hotel} />
        </section>
      )}

      {/* Day-by-day itinerary */}
      {itinerary.days?.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
            <Calendar size={18} className="text-indigo-500" /> Day-by-Day Itinerary
          </h2>
          <div className="space-y-4">
            {itinerary.days.map((day, idx) => (
              <DayCard key={day.date || idx} day={day} dayNumber={idx + 1} />
            ))}
          </div>
        </section>
      )}

      {/* Budget breakdown footer */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <IndianRupee size={18} className="text-emerald-500" /> Budget Breakdown
        </h2>
        <div className="space-y-3">
          {flightsCost > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-600">
                <Plane size={15} className="text-blue-400" />
                <span className="text-sm">Flights</span>
              </div>
              <span className="font-semibold text-slate-800 text-sm">
                {formatCurrency(flightsCost)}
              </span>
            </div>
          )}
          {hotelCost > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-600">
                <Building2 size={15} className="text-purple-400" />
                <span className="text-sm">Hotel</span>
              </div>
              <span className="font-semibold text-slate-800 text-sm">
                {formatCurrency(hotelCost)}
              </span>
            </div>
          )}
          {totalActivitiesCost > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-600">
                <MapPin size={15} className="text-emerald-400" />
                <span className="text-sm">Activities</span>
              </div>
              <span className="font-semibold text-slate-800 text-sm">
                {formatCurrency(totalActivitiesCost)}
              </span>
            </div>
          )}
          <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
            <span className="font-bold text-slate-800">Total</span>
            <span className="font-extrabold text-indigo-600 text-lg">
              {formatCurrency(itinerary.totalCost)}
            </span>
          </div>
        </div>

        {brief && (
          <div className="mt-4 bg-slate-50 rounded-xl p-3">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-2">
              Budget Range
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    itinerary.totalCost > brief.budgetMax
                      ? "bg-red-400"
                      : itinerary.totalCost > brief.budgetMin
                      ? "bg-amber-400"
                      : "bg-emerald-400"
                  }`}
                  style={{
                    width: `${Math.min(
                      100,
                      (itinerary.totalCost / brief.budgetMax) * 100
                    )}%`,
                  }}
                />
              </div>
              <span className="text-xs text-slate-500 whitespace-nowrap">
                {formatCurrency(brief.budgetMin)} – {formatCurrency(brief.budgetMax)}
              </span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
